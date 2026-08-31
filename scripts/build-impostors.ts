/**
 * Render production Tripo GLBs into transparent cards and pack each set into a
 * WebP atlas. Blender handles material-correct transparent renders; Sharp only
 * crops, packs and compresses the finished frames.
 *
 *   npm run impostor:build                 # every variant
 *   npm run impostor:build -- sasa-leaf    # only the named ones
 *   BLENDER_BIN=/path/to/blender npm run impostor:build
 *
 * Two shapes of output live here:
 *  · **회전 아틀라스** (`frames: 8`) — 삼나무 원경. 카메라 방위로 프레임을 고른다
 *  · **단일 카드** (`frames: 1`) — 대나무 잎·줄기. 게임이 카드를 교차시키거나 타일링해서 쓰므로
 *    방향별 촬영이 필요 없다. `crop` 은 타일링용으로 이음매가 없는 구간만 잘라낸다
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const blender = process.env['BLENDER_BIN'] ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const renderer = resolve(ROOT, 'scripts/blender/render-impostor-frames.py');
const outDir = resolve(ROOT, 'public/textures/impostors');
const scratch = mkdtempSync(join(tmpdir(), 'higanbana-impostors-'));

interface Variant {
  name: string;
  source: string;
  /** 촬영 방향 수. 1 이면 카드 한 장, 8 이면 45° 간격 회전 아틀라스 */
  frames: number;
  cellW: number;
  cellH: number;
  /** 아틀라스 열 수 (frames 가 1 이면 1) */
  columns: number;
  /** 납작한 모델을 정면에서 찍는다 (잎 스프레이용) */
  faceWidest?: boolean;
  /**
   * 세로로 타일링할 표피 텍스처로 만든다. 먼저 알파 여백을 잘라내 **실루엣에 딱 맞춘 뒤**
   * (원기둥 UV 는 여백을 감당하지 못한다) 높이 비율 [시작, 끝] 구간만 남긴다.
   * 양 끝이 **마디 사이**에 떨어져야 반복 이음매가 안 보인다.
   */
  tileY?: [number, number];
}

/** 알파가 0 이 아닌 픽셀의 바운딩박스. 실루엣에 딱 맞는 크롭을 위해 쓴다. */
async function alphaBounds(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3]! === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) throw new Error(`${path} is fully transparent`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const variants: Variant[] = [
  // 배포본은 meshopt 압축이라 Blender가 직접 열지 못한다. 같은 Tripo 원본을 렌더하면
  // 압축 손실 전의 텍스처를 쓰므로 임포스터 품질도 오히려 더 좋다.
  { name: 'cedar-a', source: 'assets/tripo/prop-cedar-a/model_url.glb', frames: 8, cellW: 512, cellH: 1024, columns: 4 },
  { name: 'cedar-b', source: 'assets/tripo/prop-cedar-b/model_url.glb', frames: 8, cellW: 512, cellH: 1024, columns: 4 },
  // 笹 잎 스프레이 — 대나무 줄기에 교차로 붙일 카드 한 장. 납작하므로 정면에서 찍는다
  { name: 'sasa-leaf', source: 'assets/tripo/prop-sasa-leaf/model_url.glb', frames: 1, cellW: 512, cellH: 512, columns: 1, faceWidest: true },
  // 대나무 줄기 표피 — 원기둥에 세로로 타일링한다.
  // 렌더 실측(2026-08-26): 실루엣 높이 대비 마디가 0.21 · 0.46 · 0.66 · 0.82 에 있다.
  // 0.34(마디 1–2 사이) ~ 0.91(마디 4–아래 끝 사이)을 잘라 **마디 3개짜리 타일**을 만든다
  { name: 'bamboo-culm', source: 'assets/tripo/prop-bamboo-culm/model_url.glb', frames: 1, cellW: 256, cellH: 1024, columns: 1, tileY: [0.34, 0.91] },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const selected = only.length ? variants.filter((v) => only.includes(v.name)) : variants;
if (!selected.length) throw new Error(`no variant matched ${only.join(', ')} (have: ${variants.map((v) => v.name).join(', ')})`);

mkdirSync(outDir, { recursive: true });

try {
  for (const variant of selected) {
    const framesDir = resolve(scratch, variant.name);
    mkdirSync(framesDir, { recursive: true });
    const args = [
      '--background', '--factory-startup', '--python', renderer, '--',
      resolve(ROOT, variant.source), framesDir,
      '--frames', String(variant.frames),
      '--res', `${variant.cellW}x${variant.cellH}`,
    ];
    if (variant.faceWidest) args.push('--face-widest');
    const run = spawnSync(blender, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (run.status !== 0) {
      throw new Error(`Blender failed for ${variant.name}\n${run.stdout}\n${run.stderr}`);
    }
    const summary = run.stdout.split('\n').find((line) => line.startsWith('IMPOSTOR'));
    if (!summary) {
      throw new Error(`Blender produced no frames for ${variant.name}\n${run.stdout}\n${run.stderr}`);
    }
    console.info(summary);

    const output = resolve(outDir, `${variant.name}-${variant.frames}.webp`);
    const webp = { quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 } as const;

    if (variant.tileY) {
      // 타일링 텍스처는 아틀라스가 아니라 한 장이다 — 실루엣에 맞춰 자르고 바로 굽는다
      const src = resolve(framesDir, 'frame-00.png');
      const box = await alphaBounds(src);
      const [from, to] = variant.tileY;
      await sharp(src)
        .extract({
          left: box.left,
          top: box.top + Math.round(box.height * from),
          width: box.width,
          height: Math.round(box.height * (to - from)),
        })
        .webp(webp)
        .toFile(output);
    } else {
      const rows = Math.ceil(variant.frames / variant.columns);
      const layers = Array.from({ length: variant.frames }, (_, frame) => ({
        input: resolve(framesDir, `frame-${String(frame).padStart(2, '0')}.png`),
        left: (frame % variant.columns) * variant.cellW,
        top: Math.floor(frame / variant.columns) * variant.cellH,
      }));
      await sharp({
        create: { width: variant.cellW * variant.columns, height: variant.cellH * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(layers)
        .webp(webp)
        .toFile(output);
    }
    const info = await sharp(output).metadata();
    console.info(`✓ ${variant.name}: ${info.width}x${info.height} → ${output.replace(ROOT + '/', '')}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
