/**
 * RSS Module — Main-process entry.
 * Registers feed CRUD IPC handlers via the module IPC router.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import type { MainRegistrar, WorkspaceContext } from '@citadel-app/core';

let db: Database.Database | null = null;

function createTables() {
    if (!db) return;
    db.exec(`
        CREATE TABLE IF NOT EXISTS feed_items (
            id TEXT PRIMARY KEY,
            feedId TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT,
            pubDate TEXT,
            content TEXT,
            contentSnippet TEXT,
            author TEXT,
            thumbnail TEXT,
            videoId TEXT,
            channelId TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_feed_items_feedId ON feed_items(feedId);
        CREATE INDEX IF NOT EXISTS idx_feed_items_pubDate ON feed_items(pubDate DESC);

        CREATE TABLE IF NOT EXISTS feed_status (
            itemId TEXT PRIMARY KEY,
            read INTEGER DEFAULT 0,
            relatedEntriesJSON TEXT DEFAULT '[]'
        );
    `);
}

export async function activateMain(registrar: MainRegistrar<'@citadel-app/youtube'>, workspace: WorkspaceContext | null) {
    // Close previous db if re-activating (workspace change)
    if (db) {
        db.close();
        db = null;
    }

    if (!workspace || !workspace.path) {
        console.warn('[YouTube/Main] No workspace — using in-memory SQLite');
        db = new Database(':memory:');
    } else if (workspace.configDir) {
        fs.ensureDirSync(workspace.configDir);
        const dbPath = path.join(workspace.configDir, 'feeds.db');
        console.log(`[YouTube/Main] Initializing feed database at: ${dbPath}`);
        db = new Database(dbPath);
    } else {
        console.warn('[YouTube/Main] No config dir — using in-memory SQLite');
        db = new Database(':memory:');
    }

    db.pragma('journal_mode = WAL');
    createTables();

    // Register feed CRUD handlers
    registrar.handle('getFeedItems', async (feedId: string, limit?: number) => {
        if (!db) return [];
        try {
            const stmt = db.prepare(`
                SELECT * FROM feed_items 
                WHERE feedId = ? 
                ORDER BY pubDate DESC 
                LIMIT ?
            `);
            return stmt.all(feedId, limit) as any[];
        } catch (error) {
            console.error(`[YouTube/Main] Failed to get feed items for ${feedId}:`, error);
            return [];
        }
    });

    registrar.handle('saveFeedItems', async (feedId: string, items: any[]) => {
        if (!db) return;
        try {
            const insert = db.prepare(`
                INSERT INTO feed_items (id, feedId, title, link, pubDate, content, contentSnippet, author, thumbnail, videoId, channelId)
                VALUES (@id, @feedId, @title, @link, @pubDate, @content, @contentSnippet, @author, @thumbnail, @videoId, @channelId)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    link = excluded.link,
                    pubDate = excluded.pubDate,
                    content = excluded.content,
                    contentSnippet = excluded.contentSnippet,
                    author = excluded.author,
                    thumbnail = excluded.thumbnail,
                    videoId = excluded.videoId,
                    channelId = excluded.channelId
            `);

            const transaction = db.transaction((feedItems: any[]) => {
                for (const item of feedItems) {
                    insert.run({
                        id: item.id || `${item.pubDate}-${item.title}`,
                        feedId: feedId,
                        title: item.title || 'Untitled',
                        link: item.link || '',
                        pubDate: item.pubDate || '',
                        content: item.content || '',
                        contentSnippet: item.contentSnippet || '',
                        author: item.author || '',
                        thumbnail: item.thumbnail || '',
                        videoId: item.videoId || '',
                        channelId: item.channelId || ''
                    });
                }
            });

            transaction(items);
        } catch (error) {
            console.error(`[YouTube/Main] Failed to save feed items for ${feedId}:`, error);
            throw error;
        }
    });

    registrar.handle('getFeedStatus', async () => {
        if (!db) return {};
        try {
            const stmt = db.prepare('SELECT * FROM feed_status');
            const rows = stmt.all() as any[];
            
            const statusMap: Record<string, any> = {};
            for (const row of rows) {
                statusMap[row.itemId] = {
                    read: row.read === 1,
                    relatedEntries: JSON.parse(row.relatedEntriesJSON || '[]')
                };
            }
            return statusMap;
        } catch (error) {
            console.error('[YouTube/Main] Failed to get feed statuses:', error);
            return {};
        }
    });

    registrar.handle('updateFeedStatus', async (itemId: string, status: any) => {
        if (!db) return;
        try {
            const getStmt = db.prepare('SELECT * FROM feed_status WHERE itemId = ?');
            const existing = getStmt.get(itemId) as any;

            const readVal = status.read !== undefined ? (status.read ? 1 : 0) : (existing?.read || 0);
            const relatedEntriesJSON = status.relatedEntries !== undefined 
                ? JSON.stringify(status.relatedEntries) 
                : (existing?.relatedEntriesJSON || '[]');

            const insert = db.prepare(`
                INSERT INTO feed_status (itemId, read, relatedEntriesJSON)
                VALUES (?, ?, ?)
                ON CONFLICT(itemId) DO UPDATE SET
                    read = excluded.read,
                    relatedEntriesJSON = excluded.relatedEntriesJSON
            `);

            insert.run(itemId, readVal, relatedEntriesJSON);
        } catch (error) {
            console.error(`[YouTube/Main] Failed to update feed status for ${itemId}:`, error);
            throw error;
        }
    });

    console.log('[YouTube/Main] Feed handlers registered');
}
