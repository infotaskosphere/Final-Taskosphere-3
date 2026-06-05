import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
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
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/[name]-[hash].css';
          }
          return 'assets/[name]-[hash][extname]';
        },
        // ✅ FIX: manualChunks removed.
        // The previous manualChunks config placed react/react-dom into a
        // separate 'react-core' chunk. Rollup could not guarantee that
        // 'react-core' was fully initialised before the 'Tasks' chunk ran,
        // producing a Temporal Dead Zone (TDZ) ReferenceError:
        //   "Cannot access 'ds' before initialization"
        // ('ds' is the minified name for a React export like useState/useEffect.)
        //
        // Removing manualChunks lets Rollup manage chunk boundaries itself
        // and resolve circular/ordering issues automatically.
        //
        // If you later want code-splitting, use a function form of manualChunks
        // (shown below) which is safer than the object form because Rollup
        // handles internal dependencies between chunks correctly:
        //
        // manualChunks(id) {
        //   if (id.includes('node_modules')) {
        //     if (id.includes('framer-motion'))   return 'vendor-framer';
        //     if (id.includes('lucide-react'))     return 'vendor-icons';
        //     if (id.includes('@radix-ui'))        return 'vendor-radix';
        //     if (id.includes('recharts') || id.includes('chart.js')) return 'vendor-charts';
        //     if (id.includes('@hello-pangea'))    return 'vendor-dnd';
        //     return 'vendor';   // everything else in one vendor chunk
        //   }
        // },
      },
    },
  },
  optimizeDeps: {
    include: ['@hello-pangea/dnd'],
  },
});
