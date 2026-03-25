import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCoreServices } from '@citadel-app/ui';
import { createYouTubeDataManager } from '../lib/youtube-data-manager';

import { FeedItem, Feed as YouTubeFeed, FeedItemStatus, pMap, mergeFeedItems } from '@citadel-app/core';
import { YouTubeModuleBindings } from '../lib/module-bindings';

interface YouTubeContextType {
    feeds: YouTubeFeed[];
    itemStatus: Record<string, FeedItemStatus>;
    addChannel: (urlOrHandle: string) => Promise<void>;
    updateChannel: (id: string, urlOrHandle: string) => Promise<void>;
    removeChannel: (id: string) => Promise<void>;
    refreshFeeds: () => Promise<void>;
    refreshFeed: (id: string) => Promise<void>;
    resetFeed: (id: string) => Promise<void>;
    markAsRead: (feedId: string, itemId: string) => void;
    linkEntryToItem: (feedId: string, itemId: string, entry: { id: string; type: string; title: string }) => void;
    isLoading: boolean;
}

const YouTubeContext = createContext<YouTubeContextType | undefined>(undefined);



export const useYouTube = () => {
    const context = useContext(YouTubeContext);
    if (!context) throw new Error('useYouTube must be used within a YouTubeProvider');
    return context;
};


export const YouTubeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { vaultPath, settings, toast, storage, feedDb } = useCoreServices();
    const ytData = useMemo(() => createYouTubeDataManager(storage), [storage]);
    const [feeds, setFeeds] = useState<YouTubeFeed[]>([]);
    const [itemStatus, setItemStatus] = useState<Record<string, FeedItemStatus>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);

    // Refs for stable access in callbacks
    const feedsRef = useRef(feeds);
    const itemStatusRef = useRef(itemStatus);
    const initializedRef = useRef(initialized);
    const vaultPathRef = useRef(vaultPath);

    feedsRef.current = feeds;
    itemStatusRef.current = itemStatus;
    initializedRef.current = initialized;
    vaultPathRef.current = vaultPath;

    // Use a ref to track the latest state for debounced save
    const dataToSave = useRef({ feeds, itemStatus, initialized, vaultPath });
    dataToSave.current = { feeds, itemStatus, initialized, vaultPath };

    // Load Effect (must come after refs because it sets initialized)
    useEffect(() => {
        if (!vaultPath) {
            setFeeds([]);
            setItemStatus({});
            setInitialized(false);
            return;
        }

        const load = async () => {
            setIsLoading(true);
            try {
                const savedFeeds = await ytData.loadFeeds();
                const savedStatus = await feedDb.getFeedStatus();

                if (savedFeeds) {
                    // Safety check: ensure unique IDs and valid objects
                    const idSet = new Set<string>();
                    const uniqueFeeds = savedFeeds.filter(f => f && typeof f === 'object').map(f => {
                        let id = f.id;
                        if (!id || idSet.has(id)) {
                            console.warn('[YouTubeContext] Detected duplicate or missing ID on load, generating new one:', id);
                            id = uuidv4();
                        }
                        idSet.add(id);
                        return { ...f, id };
                    });

                    // For each feed, attempt to load cached items from SQLite
                    for (const feed of uniqueFeeds) {
                        try {
                            // YouTube feeds might be larger, let's load up to 200 items for the UI
                            const cachedItems = await feedDb.getFeedItems(feed.id, 200);

                            // If we have items in JSON but not in SQLite (legacy migration), persist them to DB
                            if (feed.items && feed.items.length > 0 && cachedItems.length === 0) {
                                console.log(`[YouTubeContext] Migrating ${feed.items.length} items to SQLite for channel ${feed.id}`);
                                await feedDb.saveFeedItems(feed.id, feed.items);
                            }

                            feed.items = cachedItems.length > 0 ? cachedItems : (feed.items || []);
                        } catch (err) {
                            console.error(`[YouTubeContext] Failed to load cached items for ${feed.id}`, err);
                            feed.items = feed.items || [];
                        }
                    }

                    setFeeds(uniqueFeeds);
                }

                if (savedStatus) setItemStatus(savedStatus);
                setInitialized(true);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [vaultPath]);

    // Debounced Save effect
    useEffect(() => {
        if (!initialized || !vaultPath) return;

        const timer = setTimeout(() => {
            const { feeds: f } = dataToSave.current;
            console.log('[YouTube_DEBUG] Debounced saving feeds:', f.length);
            // Items are stripped in ytData.saveFeeds, so we just pass feeds
            ytData.saveFeeds(f);
            // Item read status is saved strictly to SQLite instantly
        }, 2000);

        return () => clearTimeout(timer);
    }, [feeds, initialized, vaultPath]);

    const fetchFeed = useCallback(async (url: string, channelId?: string): Promise<Partial<YouTubeFeed>> => {
        const res = await (window as any).api.net.fetch(url);

        if (!res.ok) {
            throw new Error(`Failed to fetch feed: ${res.status} ${res.statusText}`);
        }

        const text = res.text;
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        // Check for parsing errors
        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            throw new Error('Failed to parse YouTube feed XML');
        }

        let title = xml.querySelector('title')?.textContent || '';
        // If it's a channel feed, the title might be at feed > title
        if (!title) {
            title = xml.querySelector('feed > title')?.textContent || '';
        }

        const items: FeedItem[] = [];

        xml.querySelectorAll('entry').forEach(entry => {
            const videoId = entry.querySelector('videoId')?.textContent ||
                entry.querySelector('yt\\:videoId')?.textContent || '';

            const thumbnail = entry.querySelector('thumbnail')?.getAttribute('url') ||
                entry.querySelector('media\\:thumbnail')?.getAttribute('url') ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            const id = entry.querySelector('id')?.textContent || videoId || '';

            items.push({
                id,
                title: entry.querySelector('title')?.textContent || '',
                link: entry.querySelector('link')?.getAttribute('href') || '',
                pubDate: entry.querySelector('published')?.textContent || '',
                author: entry.querySelector('name')?.textContent || '',
                videoId,
                thumbnail,
                channelId // Explicitly bind the parent channel ID
            });
        });

        return { title, items, error: undefined };
    }, []);

    const resolveYouTubeId = useCallback(async (input: string): Promise<{ id: string; type: 'channel' | 'playlist'; title?: string }> => {
        let url = input.trim();

        // 1. Direct handle of already resolved feed URLs
        if (url.includes('channel_id=')) {
            const id = new URLSearchParams(new URL(url).search).get('channel_id');
            if (id) return { id, type: 'channel' };
        }
        if (url.includes('playlist_id=')) {
            const id = new URLSearchParams(new URL(url).search).get('playlist_id');
            if (id) return { id, type: 'playlist' };
        }

        // 2. Playlists
        if (url.includes('list=')) {
            const playlistId = new URLSearchParams(new URL(url).search).get('list');
            if (playlistId) return { id: playlistId, type: 'playlist' };
        }

        // 3. Raw IDs
        if (url.match(/^UC[a-zA-Z0-9_-]{22}$/)) return { id: url, type: 'channel' };

        // 4. Resolve handle via HTML
        if (!url.startsWith('http')) url = `https://${url}`;
        if (!url.includes('youtube.com')) {
            url = url.includes('@') ? `https://www.youtube.com/${url.substring(url.indexOf('@'))}` : `https://www.youtube.com/@${input}`;
        }

        const res = await (window as any).api.net.fetch(url);
        if (!res.ok) throw new Error('Could not reach YouTube to resolve handle');

        const html = res.text;
        const channelMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
        const externalMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
        const titleMatch = html.match(/<title>(.*?) - YouTube<\/title>/);
        const id = externalMatch?.[1] || channelMatch?.[1];
        if (!id) throw new Error('Could not find YouTube ID');
        return { id, type: 'channel', title: titleMatch?.[1]?.replace(' - YouTube', '') };
    }, []);

    const addChannel = useCallback(async (input: string) => {
        setIsLoading(true);
        try {
            // Uniqueness check helper
            const checkDuplicate = (url: string) => {
                if (feedsRef.current.some(f => f.url === url)) {
                    throw new Error('Channel already exists');
                }
            };

            const newFeedId = uuidv4();

            try {
                // 1. Prioritize Scraping (Channel/Playlist ID via resolveYouTubeId)
                const { id, type, title } = await resolveYouTubeId(input);
                const url = type === 'channel'
                    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`
                    : `https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`;

                checkDuplicate(url);

                const feedData = await fetchFeed(url, newFeedId);

                // Save DB
                if (feedData.items && feedData.items.length > 0) {
                    await feedDb.saveFeedItems(newFeedId, feedData.items);
                }

                setFeeds(prev => [...prev, {
                    id: newFeedId,
                    title: title || feedData.title || 'YouTube Channel',
                    url,
                    items: feedData.items || [],
                    lastFetched: new Date().toISOString()
                }]);
                toast(`Added YouTube scroll: ${title || feedData.title || 'Channel'}`, { type: 'success' });
                return; // Success!
            } catch (resolveError: any) {
                if (resolveError.message === 'Channel already exists') throw resolveError;
                console.warn('[YouTube] Scraping resolution failed, trying legacy user feed fallback:', resolveError.message);
            }

            // 2. Fallback: Legacy user= feed
            let handle = input.trim().replace(/^@/, '');
            if (handle.includes('youtube.com/')) {
                const parts = handle.split('/');
                const last = parts[parts.length - 1];
                handle = last.startsWith('@') ? last.substring(1) : last;
            }
            const legacyUrl = `https://www.youtube.com/feeds/videos.xml?user=${handle}`;

            checkDuplicate(legacyUrl);
            const feedData = await fetchFeed(legacyUrl, newFeedId);

            if (feedData.items && feedData.items.length > 0) {
                await feedDb.saveFeedItems(newFeedId, feedData.items);
            }

            setFeeds(prev => [...prev, {
                id: newFeedId,
                title: feedData.title || handle,
                url: legacyUrl,
                items: feedData.items || [],
                lastFetched: new Date().toISOString()
            }]);

        } catch (finalError: any) {
            console.error('[YouTube] Failed to add channel after both strategies:', finalError);
            toast(`Failed to add YouTube scroll: ${finalError.message || 'Unknown error'}`, { type: 'error' });
            throw finalError;
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed, resolveYouTubeId]);

    const updateChannel = useCallback(async (id: string, input: string) => {
        setIsLoading(true);
        try {
            // Uniqueness check helper
            const checkDuplicate = (newUrl: string) => {
                if (feedsRef.current.some(f => f.id !== id && f.url === newUrl)) {
                    throw new Error('Another channel with this URL already exists');
                }
            };

            try {
                // 1. Prioritize Scraping
                const { id: ytId, type, title: ytTitle } = await resolveYouTubeId(input);
                const url = type === 'channel' ? `https://www.youtube.com/feeds/videos.xml?channel_id=${ytId}` : `https://www.youtube.com/feeds/videos.xml?playlist_id=${ytId}`;

                checkDuplicate(url);

                const feedData = await fetchFeed(url, id);

                if (feedData.items && feedData.items.length > 0) {
                    await feedDb.saveFeedItems(id, feedData.items);
                }

                setFeeds(prev => prev.map(f => {
                    if (f.id !== id) return f;
                    const newTitle = ytTitle || (feedData.title && feedData.title !== 'YouTube' ? feedData.title : f.title);
                    return {
                        ...f,
                        ...feedData,
                        title: newTitle,
                        url,
                        items: mergeFeedItems(f.items, feedData.items || []),
                        lastFetched: new Date().toISOString(),
                        error: undefined
                    };
                }));
                toast(`Updated YouTube scroll: ${ytTitle || (feedData.title && feedData.title !== 'YouTube' ? feedData.title : 'Channel')}`, { type: 'success' });
                return;
            } catch (resolveError: any) {
                if (resolveError.message === 'Another channel with this URL already exists') throw resolveError;
                console.warn('[YouTube] Scraping resolution failed during update, trying legacy fallback:', resolveError.message);
            }

            // 2. Fallback: Legacy user=
            let handle = input.trim().replace(/^@/, '');
            if (handle.includes('youtube.com/')) {
                const parts = handle.split('/');
                const last = parts[parts.length - 1];
                handle = last.startsWith('@') ? last.substring(1) : last;
            }
            const legacyUrl = `https://www.youtube.com/feeds/videos.xml?user=${handle}`;

            checkDuplicate(legacyUrl);
            const feedData = await fetchFeed(legacyUrl, id);

            if (feedData.items && feedData.items.length > 0) {
                await feedDb.saveFeedItems(id, feedData.items);
            }

            setFeeds(prev => prev.map(f => {
                if (f.id !== id) return f;
                const newTitle = feedData.title && feedData.title !== 'YouTube' ? feedData.title : f.title;
                return {
                    ...f,
                    ...feedData,
                    title: newTitle,
                    url: legacyUrl,
                    items: mergeFeedItems(f.items, feedData.items || []),
                    lastFetched: new Date().toISOString(),
                    error: undefined
                };
            }));

        } catch (finalError: any) {
            console.error('[YouTube] Failed to update channel after both strategies:', finalError);
            toast(`Failed to update YouTube scroll: ${finalError.message || 'Unknown error'}`, { type: 'error' });
            throw finalError;
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed, resolveYouTubeId]);

    const removeChannel = useCallback(async (id: string) => {
        setFeeds(prev => prev.filter(f => f.id !== id));
    }, []);


    const applyUpdates = useCallback((updates: any[]) => {
        setFeeds(currentFeeds => {
            return currentFeeds.map(feed => {
                const update = updates.find(u => u.id === feed.id);
                if (!update) return feed;

                if (update.error) {
                    return { ...feed, error: update.error };
                }

                if (update.data) {
                    const mergedItems = mergeFeedItems(feed.items, update.data.items || []);
                    // Optimization: Only update if items actually changed or other metadata changed
                    const itemsChanged = mergedItems.length !== feed.items.length ||
                        (mergedItems.length > 0 && mergedItems[0].id !== (feed.items[0]?.id));

                    const newTitle = update.data.title && update.data.title !== 'YouTube' ? update.data.title : feed.title;

                    if (!itemsChanged && feed.title === newTitle && !feed.error) {
                        return { ...feed, lastFetched: new Date().toISOString() };
                    }

                    // Save entirely new/updated items to SQLite DB
                    if (update.data.items && update.data.items.length > 0) {
                        feedDb.saveFeedItems(feed.id, update.data.items).catch((e: any) => console.error(e));
                    }

                    return {
                        ...feed,
                        ...update.data,
                        title: newTitle,
                        items: mergeFeedItems(feed.items, update.data.items || []),
                        lastFetched: new Date().toISOString(),
                        error: undefined
                    };
                }

                return feed;
            });
        });
    }, []);

    const refreshFeeds = useCallback(async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);

        const batchSize = settings?.plugins?.['@citadel-app/rss']?.feedRefreshBatchSize || 5;
        let pendingUpdates: any[] = [];

        try {
            // Fetch updates using pMap for concurrency control
            await pMap(feedsRef.current, async (f) => {
                try {
                    const data = await fetchFeed(f.url, f.id);
                    pendingUpdates.push({ id: f.id, data, error: undefined });
                } catch (err: any) {
                    pendingUpdates.push({ id: f.id, data: undefined, error: err.message || 'Refresh failed' });
                }

                if (pendingUpdates.length >= batchSize) {
                    const currentBatch = [...pendingUpdates];
                    pendingUpdates = [];
                    applyUpdates(currentBatch);
                }
            }, 3);

            // Final batch
            if (pendingUpdates.length > 0) {
                applyUpdates(pendingUpdates);
            }
            if (!isBackground) toast('YouTube scrolls refreshed', { type: 'success' });
        } catch (err: any) {
            if (!isBackground) toast('Failed to refresh YouTube scrolls', { type: 'error' });
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, [fetchFeed, applyUpdates, settings?.plugins?.['@citadel-app/rss']?.feedRefreshBatchSize, toast]);

    // Background Refresh Effect
    useEffect(() => {
        const interval = settings?.plugins?.['@citadel-app/rss']?.youtubeRefreshInterval || 0;
        if (interval > 0 && initialized) {
            console.log(`[YouTubeContext] Starting background refresh interval: ${interval}ms`);
            const timer = setInterval(() => {
                refreshFeeds(true);
            }, interval);
            return () => clearInterval(timer);
        }
        return undefined;
    }, [settings?.plugins?.['@citadel-app/rss']?.youtubeRefreshInterval, initialized, refreshFeeds]);

    const refreshFeed = useCallback(async (id: string) => {
        setIsLoading(true);
        try {
            const feed = feedsRef.current.find(f => f.id === id);
            if (!feed) return;
            // Fetch data BEFORE updating state to avoid sequential state reliance
            const feedData = await fetchFeed(feed.url, feed.id);

            if (feedData.items && feedData.items.length > 0) {
                await feedDb.saveFeedItems(feed.id, feedData.items);
            }

            setFeeds(prev => prev.map(f => {
                if (f.id !== id) return f;

                const newTitle = feedData.title && feedData.title !== 'YouTube' ? feedData.title : f.title;
                return {
                    ...f,
                    ...feedData,
                    title: newTitle,
                    items: mergeFeedItems(f.items, feedData.items || []),
                    lastFetched: new Date().toISOString(),
                    error: undefined
                };
            }));
        } catch (err: any) {
            setFeeds(prev => prev.map(f => f.id === id ? { ...f, error: err.message || 'Refresh failed' } : f));
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed]);

    const resetFeed = useCallback(async (id: string) => {
        setIsLoading(true);
        try {
            const feed = feedsRef.current.find(f => f.id === id);
            if (!feed) return;

            const data = await fetchFeed(feed.url, feed.id);

            if (data.items && data.items.length > 0) {
                await feedDb.saveFeedItems(feed.id, data.items);
            }

            setFeeds(prev => prev.map(f => {
                if (f.id !== id) return f;

                const newTitle = data.title && data.title !== 'YouTube' ? data.title : f.title;
                return {
                    ...f,
                    ...data,
                    title: newTitle,
                    items: data.items || [],
                    lastFetched: new Date().toISOString(),
                    error: undefined
                };
            }));
        } catch (err: any) {
            setFeeds(prev => prev.map(f => f.id === id ? { ...f, error: err.message || 'Reset failed' } : f));
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed]);

    const markAsRead = useCallback((_feedId: string, itemId: string) => {
        setItemStatus(prev => {
            const nextStatus = { ...prev, [itemId]: { ...(prev[itemId] || { relatedEntries: [] }), read: true } };
            feedDb.updateFeedStatus(itemId, nextStatus[itemId]).catch((e: any) => console.error(e));
            return nextStatus;
        });
    }, []);

    const linkEntryToItem = useCallback((_feedId: string, itemId: string, entry: { id: string; type: string; title: string }) => {
        setItemStatus(prev => {
            const current = prev[itemId] || { read: false, relatedEntries: [] };
            if (current.relatedEntries.some(e => e.id === entry.id)) return prev;

            const nextStatus = {
                ...prev,
                [itemId]: {
                    ...current,
                    relatedEntries: [...current.relatedEntries, entry]
                }
            };

            feedDb.updateFeedStatus(itemId, nextStatus[itemId]).catch((e: any) => console.error(e));
            return nextStatus;
        });
    }, []);

    // Provide registry extension bindings
    useEffect(() => {
        const searchItems = async (query: string): Promise<any[]> => {
            if (!query || query.includes(':')) return [];
            const lowSearch = query.toLowerCase();
            const results: any[] = [];
            for (const feed of feedsRef.current) {
                const matches = (feed.items || []).filter(item => item.title.toLowerCase().includes(lowSearch));
                for (const item of matches) {
                    results.push({
                        id: item.id,
                        type: 'youtube-video',
                        title: item.title,
                        url: item.link,
                        metadata: { feedId: feed.id }
                    });
                }
            }
            return results.slice(0, 5);
        };
        YouTubeModuleBindings.setBindings(linkEntryToItem, searchItems);
    }, [linkEntryToItem]);

    return (
        <YouTubeContext.Provider value={{
            feeds,
            itemStatus,
            addChannel,
            updateChannel,
            removeChannel,
            refreshFeeds,
            refreshFeed,
            resetFeed,
            markAsRead,
            linkEntryToItem,
            isLoading
        }}>
            {children}
        </YouTubeContext.Provider>
    );
};
