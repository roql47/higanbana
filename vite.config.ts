import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 4500 },
});
