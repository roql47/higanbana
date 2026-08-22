import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // 배포 루트. 기본값 '/' 는 개발 서버와 Cloudflare Pages(루트 도메인)용.
  // GitHub Pages 는 roql47.github.io/higanbana/ 하위라 워크플로가 BASE_PATH=/higanbana/ 를 준다.
  // 하위 경로일 때만 main.ts 의 setURLModifier 가 런타임 절대 경로('/models/…')를 보정한다.
  base: process.env['BASE_PATH'] || '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // PORT 를 주면 그 포트로 — 같은 저장소에서 두 세션이 동시에 dev 서버를 띄울 때 필요하다
  server: { port: Number(process.env['PORT']) || 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 4500 },
});
