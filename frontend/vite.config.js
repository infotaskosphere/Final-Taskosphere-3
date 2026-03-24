import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // This allows you to use @/ instead of relative paths like ../../../
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Vite defaults to 'dist', but ensure Render points here
    outDir: 'dist',
    // Helps with debugging during the migration
    sourcemap: true,
    // Ensures assets are handled correctly
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
    strictPort: true,
    // Helpful if you want to test the production build locally
    host: true,
  },
});
