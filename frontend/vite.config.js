import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// In ESM (type: module), __dirname is not defined by default. 
// We define it here to ensure the '@' alias works perfectly on Render's Linux servers.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // This maps '@' to your 'src' folder for clean imports
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Vite builds to 'dist'. Ensure Render's "Publish Directory" is set to 'dist'
    outDir: 'dist',
    sourcemap: true,
    // Ensures assets like logos/fonts are hashed correctly for production
    assetsDir: 'assets',
    // Rollup specific options to handle large chunks
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
  },
});
