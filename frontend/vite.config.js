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

  // ✅ FIX 1: Tell esbuild to treat .js files as JSX during dep optimization
  // This is the #1 cause of Rollup parseAst crashes after CRA → Vite migration
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },

  // ✅ FIX 2: Tell esbuild to treat .js files as JSX during the actual build
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },

  build: {
    outDir: 'dist',
    // ✅ FIX 3: Disable sourcemaps in prod — they consume a lot of memory
    // on Render's free tier and can cause OOM build failures
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
    // ✅ FIX 4: Raise chunk size warning limit (you have many large deps)
    chunkSizeWarningLimit: 1000,
  },

  server: {
    port: 3000,
    strictPort: true,
    host: true,
  },
});
