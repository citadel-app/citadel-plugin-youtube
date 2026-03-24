// Module-owned data managers
export { createYouTubeDataManager, type YouTubeDataManager } from './lib/youtube-data-manager';

// Legacy exports (temporary, until everything is fully dynamic)
export * from './context/YouTubeContext';
export * from './context/YouTubePlayerContext';
export * from './pages/YouTubePage';
export * from './components/youtube/FloatingYouTubePlayer';

import { IModule, RendererRegistrar, ScopedAPI } from '@citadel-app/core';
import React, { lazy } from 'react';
import { YouTubeProvider } from './context/YouTubeContext';
import { YouTubePlayerProvider } from './context/YouTubePlayerContext';
import { FloatingYouTubePlayer } from './components/youtube/FloatingYouTubePlayer';

export const YouTubeModule: IModule = {
    id: '@citadel-app/youtube',
    version: '1.0.0',
    ipcs: [],
    permissions: {
        ipc: [
            'fs.readFile',
            'fs.writeFile',
            'fs.exists',
            'fs.createDirectory',
            'app.updateSetting'
        ]
    },

    settingsConfig: {
        title: "YouTube Feed Tracker",
        fields: []
    },

    providers: [
        { entry: { id: 'youtube-provider', scope: 'global', priority: 101 }, component: YouTubeProvider },
        { entry: { id: 'youtube-player', scope: 'global', priority: 102 }, component: YouTubePlayerProvider }
    ],

    globalComponents: [
        { region: 'global-overlay', component: FloatingYouTubePlayer }
    ],

    routes: [
        { path: '/youtube', component: lazy(() => import('./pages/YouTubePage').then(m => ({ default: m.YouTubePage }))) }
    ],

    navigationItems: [
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

    linkSearchProviders: [],
    crossLinkHandlers: [],

    onRendererActivate: async (registrar: RendererRegistrar, _api: ScopedAPI) => {
        registrar.registerPluginSettingsConfig({
            title: 'YouTube Feeds',
            fields: [
                {
                    id: 'youtubeRefreshInterval',
                    label: 'YouTube Refresh Interval',
                    type: 'select',
                    defaultValue: 7200000,
                    options: [
                        { label: 'Manual Only', value: 0 },
                        { label: 'Every Hour', value: 3600000 },
                        { label: 'Every 2 Hours (Default)', value: 7200000 },
                        { label: 'Every 6 Hours', value: 21600000 },
                        { label: 'Every 12 Hours', value: 43200000 },
                        { label: 'Every 24 Hours', value: 86400000 }
                    ]
                },
                {
                    id: 'feedRefreshBatchSize',
                    label: 'Update Batch Size',
                    description: 'Controls how many videos are processed before the UI updates.',
                    type: 'number',
                    defaultValue: 5
                }
            ]
        });
    }
};
