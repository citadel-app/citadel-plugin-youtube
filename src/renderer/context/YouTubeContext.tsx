import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCoreServices, useToast } from '@citadel-app/ui';
import { YouTubeModuleBindings } from '../lib/module-bindings';

import { FeedItem, Feed as YouTubeFeed, FeedItemStatus, pMap, mergeFeedItems } from '@citadel-app/core';

interface YouTubeContextType {
    feeds: YouTubeFeed[];
    itemStatus: Record<string, FeedItemStatus>;
    addChannel: (url: string) => Promise<void>;
    updateChannel: (id: string, updates: Partial<YouTubeFeed>) => Promise<void>;
    removeChannel: (id: string) => Promise<void>;
    refreshFeeds: (isBackground?: boolean) => Promise<void>;
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
    const { storage, feedDb, settings, removeRelatedLinks } = useCoreServices() as any;
    const { toast } = useToast();
    const [feeds, setFeeds] = useState<YouTubeFeed[]>([]);
    const [itemStatus, setItemStatus] = useState<Record<string, FeedItemStatus>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    
    const feedsRef = useRef<YouTubeFeed[]>([]);
    feedsRef.current = feeds;

    // Persist to storage
    const saveToStorage = useCallback(async (currentFeeds: YouTubeFeed[]) => {
        await storage.writeJSON('youtube-feeds.json', currentFeeds.map((f: YouTubeFeed) => ({
            id: f.id,
            title: f.title,
            url: f.url,
            folder: f.folder,
            lastFetched: f.lastFetched
        })));
    }, [storage]);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            const saved = await storage.readJSON<any[]>('youtube-feeds.json');
            const status = await feedDb.getFeedStatus();
            
            if (saved) {
                const feedsWithItems: YouTubeFeed[] = await pMap(saved, async (f: any) => {
                    const items = await feedDb.getFeedItems(f.id);
                    return { ...f, items: items || [], isLoading: false };
                }, { concurrency: 2 });
                setFeeds(feedsWithItems);
            }
            setItemStatus(status);
            setInitialized(true);
        };
        load();
    }, [storage, feedDb]);

    // Auto-save
    useEffect(() => {
        if (initialized) {
            saveToStorage(feeds);
        }
    }, [feeds, saveToStorage, initialized]);

    const resolveYouTubeId = useCallback(async (url: string) => {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.pathname.startsWith('/watch')) return urlObj.searchParams.get('v');
                if (urlObj.pathname.startsWith('/shorts/')) return urlObj.pathname.split('/')[2];
                if (urlObj.pathname.startsWith('/v/')) return urlObj.pathname.split('/')[2];
                if (urlObj.pathname.includes('/embed/')) return urlObj.pathname.split('/')[3];
            }
            if (urlObj.hostname.includes('youtu.be')) {
                return urlObj.pathname.substring(1);
            }
        } catch (e) {}
        return null;
    }, []);

    const fetchFeed = useCallback(async (url: string, id: string): Promise<Partial<YouTubeFeed>> => {
        const videoId = await resolveYouTubeId(url);
        if (!videoId) throw new Error('Invalid YouTube URL');

        const response = await window.api.module.invoke('@citadel-app/base', 'net.fetch', `https://www.youtube.com/feeds/videos.xml?v=${videoId}`);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        
        const xml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        const title = doc.querySelector('title')?.textContent || 'YouTube';
        const entries = doc.querySelectorAll('entry');
        
        const items: FeedItem[] = Array.from(entries).map((entry: Element) => {
            const mediaGroup = entry.querySelector('group');
            return {
                id: entry.querySelector('videoId')?.textContent || entry.querySelector('id')?.textContent || uuidv4(),
                title: entry.querySelector('title')?.textContent || 'Untitled Video',
                link: entry.querySelector('link')?.getAttribute('href') || '',
                description: mediaGroup?.querySelector('description')?.textContent || '',
                published: entry.querySelector('published')?.textContent || '',
                thumbnail: mediaGroup?.querySelector('thumbnail')?.getAttribute('url') || '',
                author: entry.querySelector('author name')?.textContent || '',
                metadata: {
                    videoId: entry.querySelector('videoId')?.textContent,
                    channelId: entry.querySelector('channelId')?.textContent,
                }
            };
        });

        return { title, items };
    }, [resolveYouTubeId]);

    const addChannel = useCallback(async (url: string) => {
        setIsLoading(true);
        const id = uuidv4();
        try {
            if (feedsRef.current.some((f: YouTubeFeed) => f.url === url)) {
                throw new Error('Channel already exists');
            }

            const data = await fetchFeed(url, id);
            const newFeed: YouTubeFeed = {
                id,
                url,
                title: data.title || 'YouTube Channel',
                items: data.items || [],
                lastFetched: new Date().toISOString(),
                isLoading: false
            };

            if (newFeed.items.length > 0) {
                await feedDb.saveFeedItems(newFeed.id, newFeed.items);
            }

            setFeeds((prev: YouTubeFeed[]) => [...prev, newFeed]);
            toast(`Added channel: ${newFeed.title}`, { type: 'success' });
        } catch (err: any) {
            toast(err.message || 'Failed to add channel', { type: 'error' });
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed, feedDb, toast]);

    const updateChannel = useCallback(async (id: string, updates: Partial<YouTubeFeed>) => {
        setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => f.id === id ? { ...f, ...updates } : f));
    }, []);

    const removeChannel = useCallback(async (id: string) => {
        setFeeds((prev: YouTubeFeed[]) => prev.filter((f: YouTubeFeed) => f.id !== id));
    }, []);

    const applyUpdates = useCallback(async (updates: { id: string, data: Partial<YouTubeFeed>, error?: string }[]) => {
        setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => {
            const update = updates.find(u => u.id === f.id);
            if (!update) return f;
            
            return {
                ...f,
                ...update.data,
                items: mergeFeedItems(f.items, update.data.items || []),
                lastFetched: new Date().toISOString(),
                error: update.error,
                isLoading: false
            };
        }));
    }, []);

    const refreshFeeds = useCallback(async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);
        const pendingUpdates: { id: string, data: Partial<YouTubeFeed>, error?: string }[] = [];
        
        try {
            await pMap(feedsRef.current, async (feed: YouTubeFeed) => {
                try {
                    const data = await fetchFeed(feed.url, feed.id);
                    pendingUpdates.push({ id: feed.id, data });
                    if (data.items && data.items.length > 0) {
                        await feedDb.saveFeedItems(feed.id, data.items);
                    }
                } catch (err: any) {
                    pendingUpdates.push({ id: feed.id, data: {}, error: err.message || 'Refresh failed' });
                }
            }, { concurrency: 2 });

            if (pendingUpdates.length > 0) {
                applyUpdates(pendingUpdates);
            }
            if (!isBackground) toast('YouTube scrolls refreshed', { type: 'success' });
        } catch (err: any) {
            if (!isBackground) toast('Failed to refresh YouTube scrolls', { type: 'error' });
        } finally {
            if (!isBackground) setIsLoading(false);
        }
    }, [fetchFeed, applyUpdates, feedDb, toast]);

    // Background Refresh Effect
    useEffect(() => {
        const interval = (settings?.plugins as any)?.['@citadel-app/youtube']?.youtubeRefreshInterval || 0;
        if (interval > 0 && initialized) {
            const timer = setInterval(() => {
                refreshFeeds(true);
            }, interval);
            return () => clearInterval(timer);
        }
        return undefined;
    }, [settings, initialized, refreshFeeds]);

    const refreshFeed = useCallback(async (id: string) => {
        setIsLoading(true);
        try {
            const feed = feedsRef.current.find((f: YouTubeFeed) => f.id === id);
            if (!feed) return;
            
            const feedData = await fetchFeed(feed.url, feed.id);

            if (feedData.items && feedData.items.length > 0) {
                await feedDb.saveFeedItems(feed.id, feedData.items);
            }

            setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => {
                if (f.id !== id) return f;

                return {
                    ...f,
                    ...feedData,
                    items: mergeFeedItems(f.items, feedData.items || []),
                    lastFetched: new Date().toISOString(),
                    error: undefined,
                    isLoading: false
                };
            }));
        } catch (err: any) {
            setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => f.id === id ? { ...f, error: err.message || 'Refresh failed', isLoading: false } : f));
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed, feedDb]);

    const resetFeed = useCallback(async (id: string) => {
        setIsLoading(true);
        try {
            const feed = feedsRef.current.find((f: YouTubeFeed) => f.id === id);
            if (!feed) return;

            const data = await fetchFeed(feed.url, feed.id);

            if (data.items && data.items.length > 0) {
                await feedDb.saveFeedItems(feed.id, data.items);
            }

            setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => {
                if (f.id !== id) return f;

                return {
                    ...f,
                    ...data,
                    items: data.items || [],
                    lastFetched: new Date().toISOString(),
                    error: undefined,
                    isLoading: false
                };
            }));
        } catch (err: any) {
            setFeeds((prev: YouTubeFeed[]) => prev.map((f: YouTubeFeed) => f.id === id ? { ...f, error: err.message || 'Reset failed', isLoading: false } : f));
        } finally {
            setIsLoading(false);
        }
    }, [fetchFeed, feedDb]);

    const markAsRead = useCallback((_feedId: string, itemId: string) => {
        setItemStatus((prev: Record<string, FeedItemStatus>) => {
            const current = prev[itemId] || { linkedEntries: [], read: false };
            const nextStatus = { ...prev, [itemId]: { ...current, read: true } };
            feedDb.updateFeedStatus(itemId, nextStatus[itemId]).catch((e: any) => console.error(e));
            return nextStatus;
        });
    }, [feedDb]);

    const linkEntryToItem = useCallback((_feedId: string, itemId: string, entry: { id: string; type: string; title: string }) => {
        setItemStatus((prev: Record<string, FeedItemStatus>) => {
            const current = prev[itemId] || { read: false, relatedEntries: [] };
            if (current.relatedEntries.some((e: any) => e.id === entry.id)) return prev;

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
    }, [feedDb]);

    // Provide registry extension bindings
    useEffect(() => {
        const searchItems = async (query: string): Promise<any[]> => {
            if (!query || query.includes(':')) return [];
            const lowSearch = query.toLowerCase();
            const results: any[] = [];
            for (const feed of feedsRef.current) {
                const matches = (feed.items || []).filter((item: FeedItem) => item.title.toLowerCase().includes(lowSearch));
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
