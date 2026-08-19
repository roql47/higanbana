/**
 * Tripo API v3 최소 클라이언트 (Node 24, 네이티브 TS 실행: `node scripts/tripo/xxx.ts`)
 * - 키: .env 의 TRIPO_API_KEY (또는 환경변수)
 * - 출력 URL은 5분 만료 → 성공 즉시 다운로드
 * - 모든 태스크를 docs/tripo-log.jsonl 에 기록 (task_id, 파라미터, 크레딧)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BASE = 'https://openapi.tripo3d.ai/v3';
export const OUT_DIR = resolve(ROOT, 'assets/tripo');
const LOG = resolve(ROOT, 'docs/tripo-log.jsonl');

export function apiKey(): string {
  if (process.env['TRIPO_API_KEY']) return process.env['TRIPO_API_KEY'];
  const envPath = resolve(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*TRIPO_API_KEY\s*=\s*"?([^"\s]+)"?/);
      if (m?.[1]) return m[1];
    }
  }
  throw new Error('TRIPO_API_KEY not found (.env or env var)');
}

type Json = Record<string, unknown>;

async function api<T = Json>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: { code?: number; data?: T; message?: string; suggestion?: string };
  try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} non-JSON: ${text.slice(0, 300)}`); }
  if (!res.ok || json.code !== 0) {
    throw new Error(`Tripo API ${path} → HTTP ${res.status} code=${json.code} ${json.message ?? ''} ${json.suggestion ?? ''}`.trim());
  }
  return json.data as T;
}

export async function balance() {
  return api<{ balance: number; frozen: number }>('/account/balance');
}

export async function uploadFile(filePath: string): Promise<string> {
  const buf = readFileSync(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'glb' ? 'model/gltf-binary' : 'application/octet-stream';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), basename(filePath));
  const data = await api<{ file_token: string }>('/files', { method: 'POST', body: form });
  return data.file_token;
}

export async function createTask(path: string, body: Json): Promise<string> {
  const data = await api<{ task_id: string }>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.task_id;
}

export interface TaskInfo {
  task_id: string;
  type: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'banned' | string;
  progress: number;
  output?: Record<string, unknown>;
  credits_consumed?: number;
  error_code?: number;
  error_message?: string;
}

export async function getTask(taskId: string) {
  return api<TaskInfo>(`/tasks/${taskId}`);
}

export async function waitTask(taskId: string, label = taskId, intervalMs = 2500): Promise<TaskInfo> {
  let lastProgress = -1;
  const t0 = Date.now();
  for (;;) {
    const t = await getTask(taskId);
    if (t.progress !== lastProgress || t.status !== 'running') {
      process.stdout.write(`  [${label}] ${t.status} ${t.progress ?? 0}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
      lastProgress = t.progress;
    }
    if (t.status === 'success') return t;
    if (['failed', 'cancelled', 'banned'].includes(t.status)) {
      throw new Error(`Task ${taskId} ${t.status}: ${t.error_code ?? ''} ${t.error_message ?? ''}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function download(url: string, dest: string) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

/** output 안의 URL 필드를 전부 다운로드 (model_url, pbr_model, base_model, rendered_image_url, model_urls...) */
export async function downloadOutputs(t: TaskInfo, dir: string, prefix = '') {
  mkdirSync(dir, { recursive: true });
  const saved: Record<string, string> = {};
  const out = t.output ?? {};
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.startsWith('http')) entries.push([k, v]);
    else if (Array.isArray(v)) v.forEach((u, i) => typeof u === 'string' && u.startsWith('http') && entries.push([`${k}_${i}`, u]));
    else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof v2 === 'string' && v2.startsWith('http')) entries.push([`${k}_${k2}`, v2]);
      }
    }
  }
  for (const [k, url] of entries) {
    const clean = url.split('?')[0]!;
    const ext = clean.split('.').pop()?.toLowerCase() ?? 'bin';
    const file = resolve(dir, `${prefix}${k}.${ext}`);
    const n = await download(url, file);
    saved[k] = file;
    process.stdout.write(`  ↓ ${k} → ${file.replace(ROOT + '/', '')} (${(n / 1024 / 1024).toFixed(2)} MB)\n`);
  }
  writeFileSync(resolve(dir, `${prefix}task.json`), JSON.stringify(t, null, 2));
  return saved;
}

export function logTask(entry: Json) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

/** 아주 단순한 argv 파서: --key value / --flag */
export function parseArgs(argv = process.argv.slice(2)) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

export const asBool = (v: string | boolean | undefined, def: boolean) =>
  v === undefined ? def : v === true || v === 'true' || v === '1';
