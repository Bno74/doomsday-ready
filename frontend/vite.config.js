import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :3001; the proxy keeps the browser on one origin.
const apiTarget = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': apiTarget },
  },
  preview: {
    port: 4173,
    proxy: { '/api': apiTarget },
  },
});
