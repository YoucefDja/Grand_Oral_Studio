import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA "News mobile". En dev, /api/* est proxysé vers le backend local.
// En production, l'app utilise VITE_API_URL (URL publique du backend Railway).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
