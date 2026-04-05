import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/notifications': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:          'dist',
    sourcemap:       false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split large vendor bundles for faster loads
        manualChunks: {
          'react-core':   ['react', 'react-dom', 'react-router-dom'],
          'framer':       ['framer-motion'],
          'charts':       ['recharts', 'chart.js'],
          'dnd':          ['@hello-pangea/dnd'],
          'radix':        [
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

  // Suppress known dev-mode warnings
  optimizeDeps: {
    include: ['@hello-pangea/dnd'],
  },
});
