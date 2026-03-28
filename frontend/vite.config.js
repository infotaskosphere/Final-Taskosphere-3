import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // ❌ FIX 1: REMOVE forcing .js → JSX (this breaks node_modules on Render)
  // optimizeDeps: {
  //   esbuildOptions: {
  //     loader: {
  //       '.js': 'jsx',
  //     },
  //   },
  // },

  // ✅ FIX 2: Restrict JSX handling ONLY to .jsx files
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx$/, // changed from .jsx?$
    // exclude: [], // ❌ not needed
  },

  build: {
    outDir: 'dist',

    // ✅ FIX 3: keep this (good for memory)
    sourcemap: false,

    assetsDir: 'assets',

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
          ],
          charts: ['chart.js', 'recharts'],
          motion: ['framer-motion'],
        },
      },
    },

    // ✅ FIX 4: keep this as-is
    chunkSizeWarningLimit: 1000,
  },

  server: {
    port: 3000,
    strictPort: true,
    host: true,
  },
});
