import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Tauri usa una porta fissa: Vite non deve mai sceglierne un'altra al volo.
const HOST = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Evita che Vite pulisca l'output di Rust durante `tauri dev`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: HOST ?? false,
    hmr: HOST ? { protocol: 'ws', host: HOST, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // WebView2 su Windows 10/11 è Chromium moderno: possiamo targetizzare alto.
    target: 'chrome110',
    // Vite 8 minifica con oxc: nessuna dipendenza esbuild da trascinare.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
