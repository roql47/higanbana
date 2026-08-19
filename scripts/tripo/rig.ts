/**
 * 리깅 가능 여부 확인 → 자동 리깅
 *
 *   node scripts/tripo/rig.ts --task task_xxx --name final [--spec mixamo|tripo] [--rig-model v1.0-20240301] [--check-only]
 * 출력: assets/tripo/<name>/rig/  (model_url.glb = 리깅된 모델, task.json)
 */
import { resolve } from 'node:path';
import { createTask, downloadOutputs, logTask, OUT_DIR, parseArgs, waitTask, balance } from './lib.ts';

const a = parseArgs();
const input = String(a['task'] ?? '');
if (!input) throw new Error('--task <generation task_id> 필요');
const name = String(a['name'] ?? input);
const spec = String(a['spec'] ?? 'mixamo');
const rigModel = String(a['rig-model'] ?? 'v1.0-20240301');
const rigType = String(a['rig-type'] ?? 'biped');
const checkOnly = a['check-only'] === true;

console.log(`▶ rig-check ${input}`);
const checkId = await createTask('/animations/rig-check', { input });
const check = await waitTask(checkId, 'rig-check');
console.log(`  riggable: ${check.output?.['riggable']}  recommended rig_type: ${check.output?.['rig_type']}`);
logTask({ step: 'rig_check', name, task_id: checkId, input, output: check.output });
if (!check.output?.['riggable']) throw new Error('모델이 리깅 불가 판정. 생성 파라미터/포즈를 조정하세요.');
if (checkOnly) process.exit(0);

const before = await balance();
const body = { input, model: rigModel, rig_type: rigType, spec, out_format: 'glb' };
console.log(`▶ rig`, JSON.stringify(body));
const rigId = await createTask('/animations/rig', body);
console.log(`  task_id: ${rigId}`);
const t = await waitTask(rigId, 'rig');
const saved = await downloadOutputs(t, resolve(OUT_DIR, name, 'rig'));
const after = await balance();
console.log(`✓ rigged. credits used: ${(before.balance - after.balance).toFixed(2)}, remaining ${after.balance}`);
logTask({ step: 'rig', name, task_id: rigId, params: body, credits: t.credits_consumed, files: saved });
