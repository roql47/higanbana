/**
 * Generated school plaster source -> compact 1K runtime PBR set.
 *
 * The generated source stays under assets/ and is never copied by Vite. Runtime
 * files are WebP: base color + tangent-space normal + packed ARM
 * (R=ambient occlusion, G=roughness, B=metalness).
 *
 *   node scripts/build-school-textures.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'assets/generated/textures/school/aged-school-plaster-source.png');
const OUT = resolve(ROOT, 'public/textures/school');
const SIZE = 1024;
const ARM_SIZE = 512; // AO/roughness are low-frequency; half resolution saves ~4 MB of decoded GPU memory.
const CHANNELS = 3;

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Opposite edges converge to the same pixels, hiding the generated-image seam. */
function featherPeriodicEdges(data: Uint8Array, width: number, height: number, border: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < border; x++) {
      const opposite = width - 1 - x;
      const keep = smoothstep(x / (border - 1));
      for (let c = 0; c < CHANNELS; c++) {
        const a = (y * width + x) * CHANNELS + c;
        const b = (y * width + opposite) * CHANNELS + c;
        const mean = (data[a]! + data[b]!) * 0.5;
        data[a] = clampByte(mean * (1 - keep) + data[a]! * keep);
        data[b] = clampByte(mean * (1 - keep) + data[b]! * keep);
      }
    }
  }
  for (let y = 0; y < border; y++) {
    const opposite = height - 1 - y;
    const keep = smoothstep(y / (border - 1));
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < CHANNELS; c++) {
        const a = (y * width + x) * CHANNELS + c;
        const b = (opposite * width + x) * CHANNELS + c;
        const mean = (data[a]! + data[b]!) * 0.5;
        data[a] = clampByte(mean * (1 - keep) + data[a]! * keep);
        data[b] = clampByte(mean * (1 - keep) + data[b]! * keep);
      }
    }
  }
}

function buildHeight(rgb: Uint8Array) {
  const out = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) {
    const p = i * CHANNELS;
    // The source is warm; perceptual luma avoids treating the straw as a giant bump.
    out[i] = clampByte(rgb[p]! * 0.28 + rgb[p + 1]! * 0.60 + rgb[p + 2]! * 0.12);
  }
  return out;
}

function buildNormal(height: Uint8Array) {
  const out = new Uint8Array(SIZE * SIZE * CHANNELS);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  const strength = 2.15;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = (
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
        + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
      ) / 1020;
      const gy = (
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
        + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
      ) / 1020;
      let nx = -gx * strength, ny = -gy * strength, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const p = (y * SIZE + x) * CHANNELS;
      out[p] = clampByte((nx * 0.5 + 0.5) * 255);
      out[p + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      out[p + 2] = clampByte((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });

const source = await sharp(SOURCE)
  .resize(SIZE, SIZE, { fit: 'cover' })
  .removeAlpha()
  .raw()
  .toBuffer();

const albedo = new Uint8Array(source);
featherPeriodicEdges(albedo, SIZE, SIZE, 88);
// Preserve the dark mood in lighting, not in an under-exposed base color.
for (let i = 0; i < albedo.length; i++) albedo[i] = clampByte(albedo[i]! * 1.34 + 18);

const height = buildHeight(albedo);
const blurred = await sharp(height, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .blur(4.2)
  .raw()
  .toBuffer();
const normal = buildNormal(height);
const arm = new Uint8Array(SIZE * SIZE * CHANNELS);
for (let i = 0; i < height.length; i++) {
  const cavity = height[i]! - blurred[i]!;
  const p = i * CHANNELS;
  arm[p] = clampByte(231 + cavity * 1.15);                 // AO: cracks remain grounded
  arm[p + 1] = clampByte(226 - Math.abs(cavity) * 0.24);  // rough, with slight break-up
  arm[p + 2] = 0;                                        // mineral plaster is non-metallic
}

const runtime = { width: SIZE, height: SIZE, channels: CHANNELS as 3 };
await Promise.all([
  sharp(albedo, { raw: runtime })
    .webp({ quality: 84, smartSubsample: true, effort: 6 })
    .toFile(resolve(OUT, 'aged-school-plaster-diff-1k.webp')),
  sharp(normal, { raw: runtime })
    // Tangent normals tolerate high-quality lossy WebP well; near-lossless was 1.4 MB by itself.
    .webp({ quality: 86, smartSubsample: true, effort: 6 })
    .toFile(resolve(OUT, 'aged-school-plaster-nor-gl-1k.webp')),
  sharp(arm, { raw: runtime })
    .resize(ARM_SIZE, ARM_SIZE, { kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 82, smartSubsample: true, effort: 6 })
    .toFile(resolve(OUT, 'aged-school-plaster-arm-512.webp')),
]);

console.info('school plaster: 1024x1024 base + normal, 512x512 packed ARM');
