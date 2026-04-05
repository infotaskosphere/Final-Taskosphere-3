import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],

  // ✅ CRITICAL FIX — keep as-is
  base: '/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port:       3000,
    strictPort: true,
    host:       true,
    proxy: {
      '/notifications': { target: 'http://localhost:8000', changeOrigin: true },
      '/api':           { target: 'http://localhost:8000', changeOrigin: true },
    },
  },

  build: {
    outDir:                  'dist',
    sourcemap:               false,
    assetsDir:               'assets',
    chunkSizeWarningLimit:   2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom', 'react-router-dom'],
          'framer':     ['framer-motion'],
          'charts':     ['recharts', 'chart.js'],
          'dnd':        ['@hello-pangea/dnd'],
          'radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-tabs',
          ],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['@hello-pangea/dnd'],
  },
});
