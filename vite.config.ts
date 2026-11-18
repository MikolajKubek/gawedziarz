import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri serves the frontend from Vite in dev (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
