/**
 * 리깅된 모델에 프리셋 애니메이션 리타겟 (클립별 GLB)
 *
 *   node scripts/tripo/animate.ts --task <rig task_id> --name final --anims idle,walk,run,jump,fall,turn
 *   (rig v1.0 프리셋은 preset:biped:<name>, rig v2.5 는 preset:<name>. --prefix 로 지정. 기본 preset:biped:)
 * 옵션: --in-place true(기본) | --parallel 3 (동시 태스크 수)
 * 출력: assets/tripo/<name>/anim/<clip>.glb + <clip>.task.json
 */
import { resolve } from 'node:path';
import { asBool, createTask, download, logTask, OUT_DIR, parseArgs, waitTask, balance } from './lib.ts';
import { writeFileSync, mkdirSync } from 'node:fs';

const a = parseArgs();
const input = String(a['task'] ?? '');
if (!input) throw new Error('--task <rig task_id> 필요');
const name = String(a['name'] ?? input);
const prefix = String(a['prefix'] ?? 'preset:biped:');
const anims = String(a['anims'] ?? 'idle,walk,run,jump,fall,turn').split(',').map((s) => s.trim()).filter(Boolean);
const inPlace = asBool(a['in-place'], true);
const parallel = Number(a['parallel'] ?? 3);

const dir = resolve(OUT_DIR, name, 'anim');
mkdirSync(dir, { recursive: true });
const before = await balance();
console.log(`credits before: ${before.balance}. clips: ${anims.join(', ')}`);

async function one(clip: string) {
  const body = { input, animation: `${prefix}${clip}`, out_format: 'glb', bake_animation: true, export_with_geometry: true, animate_in_place: inPlace };
  const id = await createTask('/animations/retarget', body);
  console.log(`▶ ${clip} → ${id}`);
  /**
   * **task_id 를 먼저 남긴다.** 아래 logTask 는 다운로드까지 끝나야 실행되므로,
   * 다운로드가 끊기거나 프로세스가 죽으면 크레딧은 나갔는데 task_id 가 사라진다.
   * Tripo 에는 태스크 목록 조회 API 가 없어 되찾을 방법도 없다(생성 때 겪은 30크레딧 손실과 같은 구멍).
   * → 생성 직후 기록해 두면 `tripo:fetch --task <id>` 로 언제든 회수할 수 있다.
   */
  logTask({ step: 'retarget_created', name, clip, task_id: id, params: body });
  const t = await waitTask(id, clip);
  const url = String(t.output?.['model_url'] ?? '');
  if (!url) throw new Error(`${clip}: model_url 없음 ${JSON.stringify(t.output)}`);
  const file = resolve(dir, `${clip}.glb`);
  const n = await download(url, file);
  writeFileSync(resolve(dir, `${clip}.task.json`), JSON.stringify(t, null, 2));
  console.log(`  ↓ ${clip}.glb (${(n / 1024 / 1024).toFixed(2)} MB) credits ${t.credits_consumed ?? '?'}`);
  logTask({ step: 'retarget', name, clip, task_id: id, params: body, credits: t.credits_consumed, file });
  return { clip, file, credits: t.credits_consumed };
}

// 제한된 동시성으로 실행
const queue = [...anims];
const results: Awaited<ReturnType<typeof one>>[] = [];
const errors: string[] = [];
await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  while (queue.length) {
    const clip = queue.shift()!;
    try { results.push(await one(clip)); } catch (e) { errors.push(`${clip}: ${(e as Error).message}`); console.error(`✗ ${clip}`, e); }
  }
}));

const after = await balance();
console.log(`✓ ${results.length}/${anims.length} clips. credits used: ${(before.balance - after.balance).toFixed(2)}, remaining ${after.balance}`);
if (errors.length) { console.error('errors:\n' + errors.join('\n')); process.exit(1); }
