import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, les appels vers /api/* sont proxysés vers le backend
// local (http://localhost:4000). En production, le frontend utilise
// VITE_API_URL (URL publique du service backend Railway).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
