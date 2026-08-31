// 렌더 PNG → 거울용 webp. 가장자리 알파를 부드럽게 죽여야 **거울 속 반사**로 읽힌다.
// 하드 알파로 두면 어두운 거울에 얼굴 스티커를 붙인 것으로 보인다.
import sharp from 'sharp';
const [,, IN, OUT] = process.argv;
const W = 1024, H = 320;
const mask = Buffer.alloc(W * H * 4);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const u = (x - W / 2) / (W * 0.5), v = (y - H / 2) / (H * 0.5);
  // 가로로 긴 타원. 아래(턱 쪽)를 조금 더 빨리 죽여 거울 테두리에 잠기게 한다
  const vv = v > 0 ? v * 1.12 : v;
  const r = Math.sqrt(u * u * 0.80 + vv * vv * 0.94);
  const a = Math.round(255 * (1 - smooth(0.58, 1.0, r)));
  const i = (y * W + x) * 4;
  mask[i] = 255; mask[i + 1] = 255; mask[i + 2] = 255; mask[i + 3] = a;
}
await sharp(IN).resize(W, H, { fit: 'fill' }).ensureAlpha()
  .composite([{ input: mask, raw: { width: W, height: H, channels: 4 }, blend: 'dest-in' }])
  .webp({ quality: 90, alphaQuality: 90 }).toFile(OUT);
const m = await sharp(OUT).metadata();
console.log(`✓ ${OUT} — ${m.width}x${m.height} ${(m.size/1024).toFixed(1)} KB`);
