/**
 * 이미지 → 3D 모델 생성
 *
 *   node scripts/tripo/generate.ts --image docs/references/character-front.png --name explore1 --texture false
 *   node scripts/tripo/generate.ts --image docs/references/character-front.png --name final --texture true --pbr true --quality detailed
 *
 * 옵션: --model v3.1-20260211 | --face-limit N | --seed N | --texture-seed N | --orientation align_image | --auto-size
 * 출력: assets/tripo/<name>/  (model_url.glb, rendered_image_url.png, task.json)
 */
import { resolve } from 'node:path';
import { asBool, createTask, downloadOutputs, logTask, OUT_DIR, parseArgs, uploadFile, waitTask, balance } from './lib.ts';

const a = parseArgs();
const prompt = a['prompt'] ? String(a['prompt']) : null; // 있으면 text-to-model
const image = String(a['image'] ?? 'docs/references/character-front.png');
const name = String(a['name'] ?? `gen-${Date.now()}`);
const model = String(a['model'] ?? 'v3.1-20260211');
const texture = asBool(a['texture'], true);
const pbr = asBool(a['pbr'], true);
const quality = String(a['quality'] ?? 'standard'); // standard | detailed | extreme
const geometryQuality = String(a['geometry-quality'] ?? 'standard');
const faceLimit = a['face-limit'] ? Number(a['face-limit']) : undefined;
const seed = a['seed'] ? Number(a['seed']) : undefined;
const textureSeed = a['texture-seed'] ? Number(a['texture-seed']) : undefined;
const orientation = a['orientation'] ? String(a['orientation']) : undefined;
const autoSize = asBool(a['auto-size'], false);

const before = await balance();
console.log(`credits before: ${before.balance}`);

const body: Record<string, unknown> = { model };
if (prompt) {
  body['prompt'] = prompt;
} else {
  console.log(`↑ uploading ${image}`);
  const fileToken = await uploadFile(image);
  console.log(`  file_token: ${fileToken}`);
  body['input'] = fileToken;
}
Object.assign(body, {
  texture,
  pbr,
  texture_quality: quality,
  geometry_quality: geometryQuality,
  auto_size: autoSize,
});
if (faceLimit) body['face_limit'] = faceLimit;
if (seed !== undefined) body['model_seed'] = seed;
if (textureSeed !== undefined) body['texture_seed'] = textureSeed;
if (orientation) body['orientation'] = orientation;

const endpoint = prompt ? '/generation/text-to-model' : '/generation/image-to-model';
console.log(`▶ ${endpoint}`, JSON.stringify(body));
const taskId = await createTask(endpoint, body);
console.log(`  task_id: ${taskId}`);
const t = await waitTask(taskId, 'gen');
const dir = resolve(OUT_DIR, name);
const saved = await downloadOutputs(t, dir);
const after = await balance();
console.log(`✓ done. credits used: ${(before.balance - after.balance).toFixed(2)} (reported ${t.credits_consumed ?? '?'}), remaining ${after.balance}`);
logTask({ step: prompt ? 'text_to_model' : 'image_to_model', name, task_id: taskId, params: body, credits: t.credits_consumed, files: saved });
