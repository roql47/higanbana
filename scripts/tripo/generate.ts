/**
 * 이미지 → 3D 모델 생성
 *
 *   node scripts/tripo/generate.ts --image docs/references/character-front.png --name explore1 --texture false
 *   node scripts/tripo/generate.ts --image docs/references/character-front.png --name final --texture true --pbr true --quality detailed
 *   node scripts/tripo/generate.ts --front a.png --side b.png --back c.png --name mio-mv --model P1-20260311
 *
 * 세 가지 경로
 *   --prompt "..."        text-to-model      (형태만 필요한 소품용. 20크레딧)
 *   --image  a.png        image-to-model     (정면 한 장. 뒷면은 **추정**한다)
 *   --front/--side/--back multiview-to-model (여러 방향 실측 → 뒷면·옆면을 지어내지 않는다)
 *
 * multiview 는 `files` 가 **정확히 4개**여야 한다 — [앞, 좌, 뒤, 우] 순서이고 없는 방향은 `{}` 로 채운다.
 * (API 검증 메시지로 확인: "files with exactly 4 items are required for multiview_to_model")
 *
 * 모델: P1-20260311 | v3.1-20260211 | v3.0-20250812 | v2.5-20250123
 * 옵션: --face-limit N | --seed N | --texture-seed N | --orientation align_image | --auto-size
 * 출력: assets/tripo/<name>/  (model_url.glb, rendered_image_url.png, task.json)
 */
import { resolve } from 'node:path';
import { asBool, createTask, downloadOutputs, logTask, OUT_DIR, parseArgs, uploadFile, waitTask, balance } from './lib.ts';

const a = parseArgs();
const prompt = a['prompt'] ? String(a['prompt']) : null; // 있으면 text-to-model
const image = String(a['image'] ?? 'docs/references/character-front.png');
// multiview: 하나라도 주어지면 multiview-to-model 로 간다
const mvFront = a['front'] ? String(a['front']) : null;
const mvSide = a['side'] ? String(a['side']) : null;
const mvBack = a['back'] ? String(a['back']) : null;
const mvRight = a['right'] ? String(a['right']) : null;
const isMultiview = !!(mvFront || mvSide || mvBack || mvRight);
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
if (isMultiview) {
  // [앞, 좌, 뒤, 우] — 없는 방향은 빈 객체. 순서를 바꾸면 모델이 뒤틀린다
  const slots = [mvFront, mvSide, mvBack, mvRight];
  const files: Record<string, string>[] = [];
  for (const f of slots) {
    if (!f) { files.push({}); continue; }
    console.log(`↑ uploading ${f}`);
    files.push({ type: f.endsWith('.jpg') || f.endsWith('.jpeg') ? 'jpg' : 'png', file_token: await uploadFile(f) });
  }
  body['files'] = files;
} else if (prompt) {
  body['prompt'] = prompt;
} else {
  console.log(`↑ uploading ${image}`);
  const fileToken = await uploadFile(image);
  console.log(`  file_token: ${fileToken}`);
  body['input'] = fileToken;
}
Object.assign(body, { texture, pbr, texture_quality: quality, auto_size: autoSize });
// P 시리즈는 geometry_quality 를 받지 않는다 (API: "geometry_quality is not supported for P-series model")
if (!model.startsWith('P')) body['geometry_quality'] = geometryQuality;
if (faceLimit) body['face_limit'] = faceLimit;
if (seed !== undefined) body['model_seed'] = seed;
if (textureSeed !== undefined) body['texture_seed'] = textureSeed;
if (orientation) body['orientation'] = orientation;

const endpoint = isMultiview ? '/generation/multiview-to-model'
  : prompt ? '/generation/text-to-model' : '/generation/image-to-model';
console.log(`▶ ${endpoint}`, JSON.stringify(body));
const taskId = await createTask(endpoint, body);
console.log(`  task_id: ${taskId}`);
/**
 * **task_id 를 먼저 남긴다.** 예전에는 다운로드까지 끝난 뒤에야 로그를 썼는데,
 * 다운로드 도중 연결이 끊기면(실제로 21 MB 받다가 끊겼다) 크레딧은 나갔는데 task_id 가 사라져
 * 재다운로드가 불가능했다. Tripo 에는 태스크 목록 조회 API 가 없어서 되찾을 방법도 없다.
 * → 생성 직후 기록해 두면 `tripo:fetch` 로 언제든 다시 받을 수 있다.
 */
logTask({ step: 'task_created', name, task_id: taskId, endpoint, params: body });
const t = await waitTask(taskId, 'gen');
const dir = resolve(OUT_DIR, name);
const saved = await downloadOutputs(t, dir);
const after = await balance();
console.log(`✓ done. credits used: ${(before.balance - after.balance).toFixed(2)} (reported ${t.credits_consumed ?? '?'}), remaining ${after.balance}`);
logTask({ step: isMultiview ? 'multiview_to_model' : prompt ? 'text_to_model' : 'image_to_model', name, task_id: taskId, params: body, credits: t.credits_consumed, files: saved });
