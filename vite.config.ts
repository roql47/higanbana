import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 티저 녹화 저장 (dev 전용) — 브라우저 MediaRecorder 가 만든 webm 을 받는 곳.
 * 페이지는 파일을 디스크에 못 쓰므로 POST /__teaser-save?name=… 로 보내면 dev/teaser/ 에 떨어진다.
 * (src/teaser/run.ts 만 쓴다. 빌드에는 들어가지 않는다 — apply: 'serve')
 */
const teaserSave = (): Plugin => ({
  name: 'teaser-save',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__teaser-save', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
      const name = (new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'take.webm').replace(/[^\w.-]/g, '_');
      const dir = join(server.config.root, 'dev', 'teaser');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, name);
      const out = createWriteStream(file);
      req.pipe(out);
      out.on('finish', () => res.end(JSON.stringify({ ok: true, file })));
      out.on('error', () => { res.statusCode = 500; res.end('write error'); });
    });
  },
});

export default defineConfig({
  plugins: [teaserSave()],
  // 배포 루트. 기본값 '/' 는 개발 서버와 Cloudflare Pages(루트 도메인)용.
  // GitHub Pages 는 roql47.github.io/higanbana/ 하위라 워크플로가 BASE_PATH=/higanbana/ 를 준다.
  // 하위 경로일 때만 main.ts 의 setURLModifier 가 런타임 절대 경로('/models/…')를 보정한다.
  base: process.env['BASE_PATH'] || '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // PORT 를 주면 그 포트로 — 같은 저장소에서 두 세션이 동시에 dev 서버를 띄울 때 필요하다
  server: { port: Number(process.env['PORT']) || 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 4500 },
});
