// Module-owned data managers
export { createYouTubeDataManager, type YouTubeDataManager } from './lib/youtube-data-manager';

// Legacy exports (temporary, until everything is fully dynamic)
export * from './context/YouTubeContext';
export * from './context/YouTubePlayerContext';
export * from './pages/YouTubePage';
export * from './components/youtube/FloatingYouTubePlayer';

import { definePlugin } from '@citadel-app/sdk';
import React, { lazy } from 'react';
import { YouTubeProvider } from './context/YouTubeContext';
import { YouTubePlayerProvider } from './context/YouTubePlayerContext';
import { FloatingYouTubePlayer } from './components/youtube/FloatingYouTubePlayer';
import { YouTubeModuleBindings } from './lib/module-bindings';
import pkg from '../../package.json';

export const YouTubeModule = definePlugin({
    id: pkg.name,
    version: pkg.version,

    renderer: {
        providers: [
            { entry: { id: 'youtube-provider', scope: 'global', priority: 101 }, component: YouTubeProvider },
            { entry: { id: 'youtube-player', scope: 'global', priority: 102 }, component: YouTubePlayerProvider }
        ],

        routes: [
            { path: '/youtube', component: lazy(() => import('./pages/YouTubePage').then(m => ({ default: m.YouTubePage }))) }
        ],

        navigation: [
            {
                id: 'nav-youtube',
                label: 'YouTube Scrolls',
                path: '/youtube',
                icon: 'Youtube',
                activeClass: 'text-primary bg-primary/10',
                inactiveClass: 'text-red-500 hover:bg-red-500/10',
                priority: 20
            }
        ],

        linkSearchProviders: [
            {
                id: 'youtube-video',
                label: 'YouTube Videos',
                icon: 'Youtube',
                search: async (query: string) => {
                    if (!YouTubeModuleBindings.search) return [];
                    return YouTubeModuleBindings.search(query);
                }
            }
        ],

        crossLinkHandlers: [
            {
                type: 'youtube-video',
                label: 'Link to Scroll',
                icon: 'Link',
                handler: (itemId: string, entry: any, metadata: any) => {
                    if (YouTubeModuleBindings.linkResolver) {
                        YouTubeModuleBindings.linkResolver(metadata.feedId, itemId, entry);
                    }
                }
            }
        ],

        settingsConfig: {
            title: 'YouTube Feeds',
            fields: [
                {
                    id: 'youtubeRefreshInterval',
                    label: 'YouTube Refresh Interval',
                    type: 'select',
                    defaultValue: 21600000,
                    options: [
                        { label: 'Manual Only', value: 0 },
                        { label: 'Every Hour', value: 3600000 },
                        { label: 'Every 2 Hours', value: 7200000 },
                        { label: 'Every 6 Hours (Default)', value: 21600000 },
                        { label: 'Every 12 Hours', value: 43200000 },
                        { label: 'Every 24 Hours', value: 86400000 }
                    ]
                },
                {
                    id: 'feedRefreshBatchSize',
                    label: 'Update Batch Size',
                    description: 'Controls how many videos are processed before the UI updates.',
                    type: 'number',
                    defaultValue: 50
                }
            ]
        },

        onActivate: async (registrar) => {
            registrar.registerGlobalComponent('global-overlay', FloatingYouTubePlayer);
        }
    }
});
