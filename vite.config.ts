import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages 프로젝트 사이트(roql47.github.io/higanbana/) 하위 경로.
  // 런타임 절대 경로('/models/…')는 main.ts 의 DefaultLoadingManager.setURLModifier 가 보정한다.
  base: '/higanbana/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 4500 },
});
