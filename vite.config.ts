import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    lib: {
      entry: {
        main: path.resolve(__dirname, 'src/main/index.ts'),
        renderer: path.resolve(__dirname, 'src/renderer/index.ts')
      },
      formats: ['cjs', 'es']
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@citadel-app/core',
        '@citadel-app/ui',
        '@citadel-app/sdk',
        'lucide-react',
        'better-sqlite3',
        'path',
        'fs-extra',
        'react-router-dom',
        'react-resizable-panels',
        'react-window'
      ],
      output: [
        {
          dir: 'dist',
          format: 'cjs',
          entryFileNames: '[name].js',
          exports: 'named'
        }
      ]
    }
  }
});
