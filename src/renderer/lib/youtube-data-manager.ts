/**
 * YouTube Feed Data Manager — owns all YouTube feed persistence.
 * Uses StorageProvider from CoreServices instead of the app's DataManager.
 */
import type { StorageProvider } from '@citadel-app/core';
import type { Feed as YouTubeFeed, FeedItemStatus } from '@citadel-app/core';

const YOUTUBE_FEEDS_PATH = '.codex/youtube-feeds.json';
const YOUTUBE_FEED_ITEMS_PATH = '.codex/youtube-feed-items.json';

export function createYouTubeDataManager(storage: StorageProvider) {
    return {
        async loadFeeds(): Promise<YouTubeFeed[]> {
            return (await storage.readJSON<YouTubeFeed[]>(YOUTUBE_FEEDS_PATH)) || [];
        },

        async saveFeeds(data: YouTubeFeed[]): Promise<void> {
            // Strip items for storage (items are ephemeral, fetched on refresh)
            const dataToSave = data.map(feed => {
                const { items, ...feedWithoutItems } = feed;
                return feedWithoutItems;
            });

            try {
                await storage.writeJSON(YOUTUBE_FEEDS_PATH, dataToSave);
            } catch (e) {
                console.warn('[YouTubeDataManager] Could not save youtube feeds:', e);
            }
        },

        async loadFeedItems(): Promise<Record<string, FeedItemStatus>> {
            return (await storage.readJSON<Record<string, FeedItemStatus>>(YOUTUBE_FEED_ITEMS_PATH)) || {};
        },

        async saveFeedItems(items: Record<string, FeedItemStatus>): Promise<void> {
            try {
                await storage.writeJSON(YOUTUBE_FEED_ITEMS_PATH, items);
            } catch (e) {
                console.warn('[YouTubeDataManager] Could not save youtube feed items:', e);
            }
        }};
}

export type YouTubeDataManager = ReturnType<typeof createYouTubeDataManager>;
