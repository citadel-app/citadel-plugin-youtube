# Citadel YouTube Plugin

The official YouTube feed plugin for the Citadel application framework.
This plugin enables the fetching, parsing, and streaming of YouTube channel and playlist data directly within Citadel workspaces.

## Features
- **YouTube DOM Scraping**: Automatically resolves raw YouTube `@handles` and URLs directly into atomic video cards.
- **YouTube Playlists**: Deep integration into playlists to automatically generate synchronized entry cards.
- **Floating Player Integration**: Wraps a dynamic, non-intrusive floating `iframe` overlay natively onto the Citadel window for uninterrupted watching while you work.
- **Background Synchronization**: Integrates heavily with `@citadel-app/core`'s data pipeline for automated background updates.
- **Schema-Driven UI**: Injects dynamically rendered Settings configurations directly into Citadel's native Plugin Manager to expose configuration controls like video batch thresholds.

## Architecture
Designed for `@citadel-app/core` v1.x+. 
This module leverages Citadel's decoupled plugin framework. It builds using Vite and relies strictly on externally verified peer dependencies executed dynamically by Citadel's frontend proxy boundary (`ScopedAPI`).

## Installation / Usage
This package is bundled as a runtime add-on. To install it into a Citadel workspace:
1. Open Citadel Activity Bar > Extensions
2. Search and click **Install** using the registry identifier `@citadel-app/youtube`.

## Development

Since this plugin operates independently from the monolithic source, it is decoupled from Citadel's primary development scripts.

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
2. Build the plugin for distribution:
   ```bash
   npm run build
   ```
   *Note: This generates separated `dist/main.js` and `dist/renderer.js` entry points optimized by Vite and Rollup.*
3. To manually debug changes locally, bundle the extension and drop the `manifest.json` inside your Citadel vault at `.codex/plugins/@citadel-app-youtube`.

## License
MIT
