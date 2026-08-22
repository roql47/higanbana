/**
 * 이미 끝난 태스크의 산출물을 **다시 내려받는다** (크레딧 0).
 *
 *   node scripts/tripo/fetch.ts --task <task_id> --name mio
 *
 * 생성은 성공했는데 다운로드가 끊겼을 때 쓴다. Tripo 산출물 URL 은 한동안 유효하므로
 * 재생성(40크레딧) 없이 회수할 수 있다. `--task` 를 생략하면 로그에서 그 이름의 마지막
 * `task_created` 를 찾아 쓴다.
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { downloadOutputs, getTask, logTask, OUT_DIR, parseArgs } from './lib.ts';

const a = parseArgs();
const name = String(a['name'] ?? '');
if (!name) throw new Error('--name <이름> 필요');

let taskId = a['task'] ? String(a['task']) : '';
if (!taskId) {
  // 로그에서 이 이름의 마지막 태스크를 찾는다
  const log = readFileSync(resolve('docs/tripo-log.jsonl'), 'utf8').trim().split('\n');
  for (let i = log.length - 1; i >= 0; i--) {
    try {
      const d = JSON.parse(log[i]!) as Record<string, unknown>;
      if (d['name'] === name && typeof d['task_id'] === 'string') { taskId = d['task_id']; break; }
    } catch { /* 깨진 줄 무시 */ }
  }
  if (!taskId) throw new Error(`로그에서 name=${name} 의 task_id 를 못 찾았다. --task 로 직접 지정하세요`);
  console.log(`  로그에서 찾음: ${taskId}`);
}

const t = await getTask(taskId);
console.log(`▶ task ${taskId} — status: ${t.status}`);
if (t.status !== 'success') throw new Error(`아직 성공 상태가 아니다: ${t.status}`);

const dir = resolve(OUT_DIR, name);
const saved = await downloadOutputs(t, dir);
console.log(`✓ 재다운로드 완료 (크레딧 0):`, saved);
logTask({ step: 'refetch', name, task_id: taskId, files: saved });
