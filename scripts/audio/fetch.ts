/**
 * 사운드 샘플 수집·가공 파이프라인 (Node 24 네이티브 TS: `node scripts/audio/fetch.ts`)
 *
 *   npm run audio:fetch                    # 전부 (이미 있으면 건너뜀)
 *   npm run audio:fetch -- --only foot/gravel,amb/wind --force
 *   npm run audio:fetch -- --report        # 다운로드 없이 현재 상태표만
 *   npm run audio:fetch -- --sync          # sources.ts 의 gain 만 manifest 에 반영 (볼륨 튜닝 — 다운로드/가공 없음)
 *   npm run audio:fetch -- --remove amb/wind   # 키를 manifest·파일에서 제거 (게임은 그 소리를 합성으로 폴백)
 *   npm run audio:fetch -- --dry-run       # 소스 해석까지만 (다운로드는 하되 가공·출력 없음)
 *   npm run audio:search -- "taiko hit" --max-dur 3   # Freesound 검색 (키 필요)
 *
 * 입력: scripts/audio/sources.ts   출력: public/audio/<key>/<n>.mp3, public/audio/manifest.json, public/audio/CREDITS.md
 * 캐시: assets/audio/cache/ (gitignore) — 같은 URL 은 다시 받지 않는다
 * 의존: ffmpeg(+libmp3lame), unzip
 *
 * 가공: 원샷 → 모노, 앞뒤 무음 제거, 피크 −1 dBFS / 루프 → 크로스페이드 루프 생성, −20 LUFS. 둘 다 44.1 kHz MP3(VBR)
 * 루프는 런타임(bank.ts)에서 두 소스를 겹쳐 크로스페이드하므로 MP3 디코더 패딩이 있어도 끊김이 없다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SOUNDS, type SoundDef, type SourceSpec, type LoopSpec } from './sources.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'public/audio');
const CACHE = resolve(ROOT, 'assets/audio/cache');
const MANIFEST = resolve(OUT, 'manifest.json');
const CREDITS_JSON = resolve(OUT, 'credits.json');
const CREDITS_MD = resolve(OUT, 'CREDITS.md');
const UA = 'higanbana-audio-fetch/0.1 (+https://github.com/ ; game asset pipeline)';

// ───────────────────────── 인자 ─────────────────────────
function parseArgs(argv = process.argv.slice(2)) {
  const out: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
    } else rest.push(a);
  }
  return { flags: out, rest };
}
const { flags, rest } = parseArgs();
const ONLY = flags['only'] ? String(flags['only']).split(',').map((s) => s.trim()) : null;
const FORCE = !!flags['force'];
const DRY = !!flags['dry-run'];
const REPORT = !!flags['report'];
const SYNC = !!flags['sync'];
const REMOVE = flags['remove'] ? String(flags['remove']).split(',').map((s) => s.trim()) : null;
const CC0_ONLY = !!flags['cc0'];
const VERBOSE = !!flags['verbose'];

// ───────────────────────── 유틸 ─────────────────────────
function sha1(s: string) { return createHash('sha1').update(s).digest('hex').slice(0, 16); }
function log(...a: unknown[]) { console.log(...a); }
function vlog(...a: unknown[]) { if (VERBOSE) console.log('   ', ...a); }
function run(cmd: string, args: string[], opts: { quiet?: boolean } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !opts.quiet) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')}… → exit ${r.status}\n${(r.stderr || '').slice(-1200)}`);
  return r;
}
function which(cmd: string) { return spawnSync('which', [cmd]).status === 0; }
function envKey(name: string): string | null {
  if (process.env[name]) return process.env[name]!;
  const envPath = resolve(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\s]+)"?`));
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

async function download(url: string, ext?: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const e = ext ?? (extname(new URL(url).pathname) || '.bin');
  const file = resolve(CACHE, `${sha1(url)}${e}`);
  if (existsSync(file) && statSync(file).size > 0) { vlog('cache', basename(file), '←', url); return file; }
  vlog('GET', url);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) throw new Error(`too small (${buf.length} B) ${url}`);
  writeFileSync(file, buf);
  return file;
}

function extractZip(zipPath: string): string {
  const dir = zipPath.replace(/\.[^.]+$/, '') + '.d';
  if (existsSync(dir) && readdirSync(dir).length > 0) return dir;
  mkdirSync(dir, { recursive: true });
  if (which('unzip')) run('unzip', ['-o', '-q', zipPath, '-d', dir]);
  else run('bsdtar', ['-xf', zipPath, '-C', dir]);
  return dir;
}

/** 디렉토리에서 상대 경로 패턴('*' 지원)으로 파일 찾기 — 결과는 정렬 */
function findFiles(dir: string, patterns: string[]): string[] {
  const all: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else all.push(p); } };
  walk(dir);
  const rel = all.map((p) => p.slice(dir.length + 1).replace(/\\/g, '/')).filter((p) => !p.includes('__MACOSX') && !basename(p).startsWith('._'));
  const out: string[] = [];
  for (const pat of patterns) {
    const re = new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
    // 정확한 경로가 없으면 어느 깊이에서든 끝부분 일치 허용 (zip 안에 상위 폴더가 하나 더 있는 경우)
    let hits = rel.filter((p) => re.test(p));
    if (hits.length === 0) hits = rel.filter((p) => new RegExp('(^|/)' + re.source.slice(1)).test(p));
    hits.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const h of hits) if (!out.includes(h)) out.push(h);
  }
  return out.map((p) => join(dir, p));
}

// ───────────────────────── 소스 해석 ─────────────────────────
interface Resolved {
  /** 로컬 원본 파일 */
  path: string;
  title: string;
  author: string;
  license: string;
  /** 출처 페이지 URL */
  source: string;
  /** 프로바이더 표시용 */
  provider: string;
}

const LICENSE_OK = /^(cc0|creative commons 0|public domain|pd|cc[- ]by(?![- ]?(sa|nc|nd))[ -]?\d?(\.\d)?( jp)?( generic)?|attribution)$/i;
function licenseAllowed(lic: string): boolean {
  const l = lic.trim();
  if (CC0_ONLY) return /^(cc0|creative commons 0|public domain|pd)/i.test(l);
  if (/(nc|non.?commercial|sa|share.?alike|nd|no.?deriv)/i.test(l) && !/^cc0|public domain/i.test(l)) return false;
  return LICENSE_OK.test(l) || /^cc[- ]by[- ]\d/i.test(l) || /^cc0/i.test(l) || /public domain/i.test(l);
}

async function resolveKenney(s: SourceSpec): Promise<Resolved[]> {
  const page = `https://kenney.nl/assets/${s.pack}`;
  const html = await (await fetch(page, { headers: { 'User-Agent': UA } })).text();
  const m = html.match(/https?:\/\/kenney\.nl\/media\/pages\/assets\/[^"']+\.zip/);
  if (!m) throw new Error(`kenney: zip 링크를 못 찾음 (${page})`);
  const zip = await download(m[0], '.zip');
  const dir = extractZip(zip);
  const files = findFiles(dir, s.files ?? []);
  if (files.length === 0) throw new Error(`kenney: 파일 없음 ${s.files?.join(',')}`);
  return files.map((f) => ({ path: f, title: `${s.pack} — ${basename(f)}`, author: 'Kenney (kenney.nl)', license: 'CC0 1.0', source: page, provider: 'kenney' }));
}

async function resolveZip(s: SourceSpec): Promise<Resolved[]> {
  const zip = await download(s.url!, '.zip');
  const dir = extractZip(zip);
  const files = findFiles(dir, s.files ?? []);
  if (files.length === 0) throw new Error(`zip: 파일 없음 ${s.files?.join(',')}`);
  return files.map((f) => ({ path: f, title: `${s.title ?? basename(s.url!)} — ${basename(f)}`, author: s.author ?? '?', license: s.license ?? '?', source: s.source ?? s.url!, provider: 'zip' }));
}

async function resolveUrl(s: SourceSpec): Promise<Resolved[]> {
  const f = await download(s.url!);
  return [{ path: f, title: s.title ?? basename(s.url!), author: s.author ?? '?', license: s.license ?? '?', source: s.source ?? s.url!, provider: 'url' }];
}

async function resolveWikimedia(s: SourceSpec): Promise<Resolved[]> {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata|mime&format=json&titles=${encodeURIComponent(s.wmTitle!)}`;
  const json = await (await fetch(api, { headers: { 'User-Agent': UA } })).json() as { query: { pages: Record<string, { title: string; imageinfo?: { url: string; extmetadata?: Record<string, { value: string }> }[] }> } };
  const page = Object.values(json.query.pages)[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) throw new Error(`wikimedia: 없음 ${s.wmTitle}`);
  const em = ii.extmetadata ?? {};
  const strip = (h?: string) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const license = strip(em['LicenseShortName']?.value) || '?';
  let author = strip(em['Artist']?.value) || strip(em['Credit']?.value) || '';
  if (!author) {
    // 메타데이터에 저자가 없으면 위키텍스트의 "Author:" 줄을 읽는다
    const wt = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&titles=${encodeURIComponent(s.wmTitle!)}`, { headers: { 'User-Agent': UA } })).json() as { query: { pages: Record<string, { revisions?: { slots: { main: { '*': string } } }[] }> } };
    const text = Object.values(wt.query.pages)[0]?.revisions?.[0]?.slots.main['*'] ?? '';
    const m = text.match(/\bAuthor[:：]\s*([^\n<]+)/) ?? text.match(/(?:撮影者|作者|author)[:：]\s*([^\n<]+)/);
    author = strip(m?.[1]?.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[|\]\]/g, '') ?? '') || '?';
  }
  const f = await download(ii.url.split('?')[0]!);
  return [{ path: f, title: page!.title.replace(/^File:/, ''), author, license, source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page!.title.replace(/ /g, '_'))}`, provider: 'wikimedia' }];
}

interface FsSound { id: number; name: string; username: string; license: string; duration: number; previews: Record<string, string>; url: string; avg_rating: number; num_ratings: number; num_downloads: number; tags: string[] }
const FS_FIELDS = 'id,name,username,license,duration,previews,url,avg_rating,num_ratings,num_downloads,tags';
async function fsApi(path: string, params: Record<string, string>): Promise<unknown> {
  const key = envKey('FREESOUND_API_KEY');
  if (!key) throw new Error('FREESOUND_API_KEY 없음 (.env) — https://freesound.org/apiv2/apply 에서 발급');
  const q = new URLSearchParams({ ...params, token: key });
  const res = await fetch(`https://freesound.org/apiv2${path}?${q}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`freesound HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
function fsLicenseName(l: string) {
  if (/creativecommons\.org\/publicdomain\/zero|Creative Commons 0/i.test(l)) return 'CC0 1.0';
  if (/licenses\/by\/4\.0|^Attribution$/i.test(l)) return 'CC BY 4.0';
  if (/licenses\/by\/3\.0/i.test(l)) return 'CC BY 3.0';
  if (/by-nc/i.test(l) || /NonCommercial/i.test(l)) return 'CC BY-NC';
  return l;
}
export async function fsSearch(query: string, opts: { filter?: string; sort?: string; minDur?: number; maxDur?: number; pageSize?: number; allowBy?: boolean } = {}): Promise<FsSound[]> {
  const lic = opts.allowBy === false ? 'license:"Creative Commons 0"' : 'license:("Creative Commons 0" OR "Attribution")';
  const dur = `duration:[${opts.minDur ?? 0} TO ${opts.maxDur ?? 600}]`;
  const filter = [lic, dur, opts.filter ?? ''].filter(Boolean).join(' ');
  const json = await fsApi('/search/', { query, filter, sort: opts.sort ?? 'downloads_desc', fields: FS_FIELDS, page_size: String(opts.pageSize ?? 30) }) as { results: FsSound[] };
  return json.results ?? [];
}
async function resolveFreesound(s: SourceSpec): Promise<Resolved[]> {
  let sounds: FsSound[];
  if (s.id) {
    const json = await fsApi(`/sounds/${s.id}/`, { fields: FS_FIELDS }) as FsSound;
    sounds = [json];
  } else {
    const all = await fsSearch(s.query!, { filter: s.filter, sort: s.sort, minDur: s.minDur, maxDur: s.maxDur, allowBy: !CC0_ONLY });
    // 점수: 다운로드수(로그) × 평점 보정. 같은 업로더 3개 초과 제외 → 다양성
    const scored = all.map((x) => ({ x, sc: Math.log10((x.num_downloads ?? 0) + 10) * (1 + Math.max(0, (x.avg_rating ?? 0) - 3) * 0.25) }));
    scored.sort((a, b) => b.sc - a.sc);
    const perUser = new Map<string, number>();
    sounds = [];
    for (const { x } of scored) {
      const n = perUser.get(x.username) ?? 0;
      if (n >= 3) continue;
      perUser.set(x.username, n + 1);
      sounds.push(x);
      if (sounds.length >= (s.pick ?? 4)) break;
    }
  }
  if (sounds.length === 0) throw new Error(`freesound: 결과 없음 "${s.query ?? s.id}"`);
  const out: Resolved[] = [];
  for (const x of sounds) {
    const lic = fsLicenseName(x.license);
    if (!licenseAllowed(lic)) { vlog('skip license', lic, x.name); continue; }
    const prev = x.previews['preview-hq-ogg'] ?? x.previews['preview-hq-mp3'];
    if (!prev) continue;
    const f = await download(prev, extname(new URL(prev).pathname) || '.ogg');
    out.push({ path: f, title: `${x.name} (freesound #${x.id})`, author: x.username, license: lic, source: x.url, provider: 'freesound' });
  }
  if (out.length === 0) throw new Error('freesound: 라이선스 조건에 맞는 결과 없음');
  return out;
}

async function resolveSource(s: SourceSpec): Promise<Resolved[]> {
  switch (s.provider) {
    case 'kenney': return resolveKenney(s);
    case 'zip': return resolveZip(s);
    case 'url': return resolveUrl(s);
    case 'wikimedia': return resolveWikimedia(s);
    case 'freesound': return resolveFreesound(s);
  }
}

// ───────────────────────── 가공 (ffmpeg) ─────────────────────────
function ffmpeg(args: string[]) { return run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); }
function measurePeakDb(file: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/max_volume:\s*(-?[\d.]+) dB/);
  return m ? parseFloat(m[1]!) : 0;
}
function measureLufs(file: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=framelog=verbose', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+) LUFS/);
  return m ? parseFloat(m[1]!) : -23;
}
function duration(file: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return parseFloat(r.stdout) || 0;
}

interface Job { input: string; out: string; kind: 'oneshot' | 'loop'; mono: boolean; tight: boolean; trim?: [number, number]; loop?: LoopSpec; hp?: number; lp?: number; rate?: number; gainDb?: number; fadeIn?: number; fadeOut?: number }

/** 1단계: 필터 → 임시 WAV, 2단계: 정규화 측정, 3단계: MP3 인코딩 */
function render(job: Job) {
  const tmp = job.out.replace(/\.mp3$/, '.tmp.wav');
  const filters: string[] = [];
  if (job.trim) filters.push(`atrim=start=${job.trim[0]}:end=${job.trim[1]}`, 'asetpts=PTS-STARTPTS');
  filters.push('aresample=44100');
  if (job.rate && job.rate !== 1) filters.push(`asetrate=${Math.round(44100 * job.rate)}`, 'aresample=44100');
  if (job.hp) filters.push(`highpass=f=${job.hp}:poles=2`);
  if (job.lp) filters.push(`lowpass=f=${job.lp}:poles=2`);
  let complex: string | null = null;
  if (job.kind === 'loop' && job.loop) {
    const { start, end, xfade } = job.loop;
    const pre_ = filters.join(',');
    // A = [start+x, end], B = [start, start+x]; A 의 꼬리와 B 를 크로스페이드 → 끝이 곧 시작점으로 이어진다
    complex = `[0:a]${pre_},asplit=2[s0][s1];[s0]atrim=start=${start + xfade}:end=${end},asetpts=PTS-STARTPTS[a];[s1]atrim=start=${start}:end=${start + xfade},asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=${xfade}:c1=tri:c2=tri[out]`;
  } else if (job.kind === 'oneshot' && job.tight) {
    // 앞 무음 제거 → 뒤집어 뒤 무음 제거 → 다시 뒤집기. 끝 5 ms 페이드로 클릭 방지
    filters.push('silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004');
    filters.push('areverse', 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.03', 'areverse');
  }
  const ac = job.mono ? ['-ac', '1'] : [];
  if (complex) ffmpeg(['-i', job.input, '-filter_complex', complex, '-map', '[out]', ...ac, '-c:a', 'pcm_s16le', tmp]);
  else ffmpeg(['-i', job.input, '-af', filters.join(','), ...ac, '-c:a', 'pcm_s16le', tmp]);

  // 정규화
  let gain = job.gainDb ?? 0;
  if (job.kind === 'oneshot') gain += -1 - measurePeakDb(tmp);
  else gain += -20 - measureLufs(tmp);
  gain = Math.max(-40, Math.min(40, gain));
  const dur = duration(tmp);
  const post: string[] = [`volume=${gain.toFixed(2)}dB`];
  if (job.fadeIn && job.fadeIn > 0) post.push(`afade=t=in:st=0:d=${job.fadeIn}`);
  if (job.kind === 'oneshot') { const fo = Math.min(dur * 0.9, job.fadeOut ?? 0.006); post.push(`afade=t=out:st=${Math.max(0, dur - fo).toFixed(3)}:d=${fo.toFixed(3)}`); }
  post.push('alimiter=limit=0.98:level=false:latency=1');
  ffmpeg(['-i', tmp, '-af', post.join(','), '-c:a', 'libmp3lame', '-q:a', job.kind === 'oneshot' ? '3' : '4', job.out]);
  rmSync(tmp, { force: true });
  return { dur, gain };
}

// ───────────────────────── 매니페스트·크레딧 ─────────────────────────
interface ManifestEntry { files: string[]; gain: number; loop: boolean; license: string; durations: number[] }
interface Manifest { version: number; generated: string; sounds: Record<string, ManifestEntry> }
interface CreditEntry { key: string; provider: string; title: string; author: string; license: string; source: string; files: string[]; note?: string }

function loadJson<T>(p: string, fallback: T): T { try { return JSON.parse(readFileSync(p, 'utf8')) as T; } catch { return fallback; } }
const manifest = loadJson<Manifest>(MANIFEST, { version: 1, generated: '', sounds: {} });
const credits = loadJson<Record<string, CreditEntry[]>>(CREDITS_JSON, {});

function writeCredits() {
  const lines: string[] = [
    '# 히간바나 — 사운드 출처 (자동 생성: `npm run audio:fetch`)',
    '',
    '이 디렉토리의 샘플은 아래 출처에서 받아 가공(자르기·정규화·루프·MP3)한 것입니다.',
    'CC BY 항목은 배포 시 이 파일(또는 게임 내 크레딧)에 표기를 유지해야 합니다.',
    '',
    '| 키 | 용도 | 출처 | 저자 | 라이선스 |',
    '|---|---|---|---|---|',
  ];
  const keys = Object.keys(credits).sort();
  for (const k of keys) {
    const note = SOUNDS.find((d) => d.key === k)?.note ?? '';
    const seen = new Set<string>();
    for (const c of credits[k]!) {
      const id = `${c.source}|${c.author}|${c.license}`;
      if (seen.has(id)) continue; seen.add(id);
      const title = c.title.replace(/ — .*$/, '').replace(/\|/g, '/');
      lines.push(`| \`${k}\` | ${note} | [${title}](${c.source}) | ${c.author.replace(/\|/g, '/')} | ${c.license} |`);
    }
  }
  lines.push('', '## 라이선스 링크', '- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/', '- CC BY 3.0: https://creativecommons.org/licenses/by/3.0/', '- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/', '- CC BY 2.1 JP: https://creativecommons.org/licenses/by/2.1/jp/', '');
  writeFileSync(CREDITS_MD, lines.join('\n'));
}
function save() {
  manifest.generated = new Date().toISOString();
  const sorted: Record<string, ManifestEntry> = {};
  for (const k of Object.keys(manifest.sounds).sort()) sorted[k] = manifest.sounds[k]!;
  manifest.sounds = sorted;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  writeFileSync(CREDITS_JSON, JSON.stringify(credits, null, 1) + '\n');
  writeCredits();
}

// ───────────────────────── 메인 ─────────────────────────
type Status = { key: string; status: 'ok' | 'kept' | 'pending' | 'missing' | 'error'; detail: string };

async function handle(def: SoundDef): Promise<Status> {
  const existing = manifest.sounds[def.key];
  const outDir = resolve(OUT, def.key);
  if (existing && !FORCE && existing.files.every((f) => existsSync(resolve(OUT, f)))) {
    return { key: def.key, status: 'kept', detail: `${existing.files.length}개 · ${existing.license}` };
  }
  let pendingFreesound = false;
  const errors: string[] = [];
  for (const src of def.sources) {
    let resolved: Resolved[];
    try {
      resolved = await resolveSource(src);
    } catch (e) {
      const msg = (e as Error).message;
      if (src.provider === 'freesound' && /FREESOUND_API_KEY/.test(msg)) { pendingFreesound = true; vlog('freesound 건너뜀 (키 없음)'); continue; }
      errors.push(`${src.provider}: ${msg.split('\n')[0]}`);
      continue;
    }
    resolved = resolved.filter((r) => { const ok = licenseAllowed(r.license); if (!ok) vlog('라이선스 제외', r.license, r.title); return ok; });
    if (resolved.length === 0) { errors.push(`${src.provider}: 허용 라이선스 없음`); continue; }
    if (DRY) return { key: def.key, status: 'ok', detail: `(dry) ${src.provider} ${resolved.length}개 · ${resolved[0]!.license}` };

    // 출력
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const files: string[] = [];
    const durs: number[] = [];
    const credit: CreditEntry[] = [];
    const max = def.max ?? 12;
    let n = 0;
    const jobsFor = (r: Resolved): Job[] => {
      const base: Omit<Job, 'out' | 'trim'> = { input: r.path, kind: def.kind, mono: def.mono ?? (def.kind === 'oneshot'), tight: def.tight ?? true, hp: src.hp, lp: src.lp, rate: src.rate, gainDb: src.gainDb, loop: src.loop, fadeIn: src.fadeIn, fadeOut: src.fadeOut };
      if (src.slices) return src.slices.map((sl) => ({ ...base, out: '', trim: sl }));
      return [{ ...base, out: '', trim: src.trim }];
    };
    for (const r of resolved) {
      for (const job of jobsFor(r)) {
        if (n >= max) break;
        const out = resolve(outDir, `${n}.mp3`);
        job.out = out;
        try {
          const { dur } = render(job);
          if (dur < 0.02) { rmSync(out, { force: true }); vlog('너무 짧음, 제외', r.title); continue; }
          files.push(`${def.key}/${n}.mp3`);
          durs.push(Math.round(dur * 1000) / 1000);
          n++;
        } catch (e) {
          vlog('가공 실패', r.title, (e as Error).message.split('\n')[0]);
        }
      }
      credit.push({ key: def.key, provider: r.provider, title: r.title, author: r.author, license: r.license, source: r.source, files: [] });
    }
    if (files.length === 0) { errors.push(`${src.provider}: 가공 결과 없음`); continue; }
    const licenses = [...new Set(credit.map((c) => c.license))].join(' / ');
    manifest.sounds[def.key] = { files, gain: def.gain ?? 1, loop: def.kind === 'loop', license: licenses, durations: durs };
    credits[def.key] = credit;
    save();
    return { key: def.key, status: 'ok', detail: `${files.length}개 ← ${src.provider} · ${licenses}${pendingFreesound ? ' (freesound 키 생기면 교체 가능)' : ''}` };
  }
  if (pendingFreesound && errors.length === 0) return { key: def.key, status: 'pending', detail: 'FREESOUND_API_KEY 필요' };
  return { key: def.key, status: errors.length ? 'error' : 'missing', detail: errors.join(' | ') || '소스 없음' };
}

function printReport(rows: Status[]) {
  const icon = { ok: '✅', kept: '·', pending: '⏳', missing: '∅', error: '❌' } as const;
  log('');
  for (const r of rows) log(`${icon[r.status]} ${r.key.padEnd(18)} ${r.detail}`);
  const c = (s: Status['status']) => rows.filter((r) => r.status === s).length;
  log(`\n합계: 새로 ${c('ok')} · 유지 ${c('kept')} · Freesound 대기 ${c('pending')} · 실패 ${c('error')} · 없음 ${c('missing')}  → ${MANIFEST.replace(ROOT + '/', '')}`);
  if (c('pending') > 0 && !envKey('FREESOUND_API_KEY')) log('   ⏳ 항목은 .env 에 FREESOUND_API_KEY=… 를 넣고 `npm run audio:fetch` 를 다시 실행하면 채워집니다 (https://freesound.org/apiv2/apply).');
}

async function main() {
  if (flags['search'] || rest[0] === 'search') {
    const q = String(flags['search'] === true ? rest.slice(1).join(' ') : flags['search'] ?? rest.slice(1).join(' '));
    const res = await fsSearch(q, { filter: flags['filter'] ? String(flags['filter']) : undefined, minDur: flags['min-dur'] ? Number(flags['min-dur']) : undefined, maxDur: flags['max-dur'] ? Number(flags['max-dur']) : undefined, allowBy: !CC0_ONLY, sort: flags['sort'] ? String(flags['sort']) : undefined });
    for (const x of res) log(`#${String(x.id).padEnd(7)} ${x.duration.toFixed(1).padStart(6)}s ★${(x.avg_rating ?? 0).toFixed(1)}(${x.num_ratings ?? 0}) ↓${x.num_downloads ?? 0}  ${fsLicenseName(x.license).padEnd(9)} ${x.name}  — ${x.username}  ${x.url}`);
    return;
  }
  if (!which('ffmpeg')) { console.error('ffmpeg 가 필요합니다 (brew install ffmpeg)'); process.exit(1); }
  const defs = SOUNDS.filter((d) => !ONLY || ONLY.includes(d.key) || ONLY.some((o) => o.endsWith('/') && d.key.startsWith(o)));
  if (REMOVE) {
    for (const k of REMOVE) {
      if (!manifest.sounds[k]) { log(`- ${k}: manifest 에 없음`); continue; }
      delete manifest.sounds[k]; delete credits[k];
      rmSync(resolve(OUT, k), { recursive: true, force: true });
      log(`✂ ${k} 제거`);
    }
    save();
    return;
  }
  if (SYNC) {
    let n = 0;
    for (const d of defs) { const e = manifest.sounds[d.key]; if (e && e.gain !== (d.gain ?? 1)) { e.gain = d.gain ?? 1; n++; } }
    save();
    log(`gain 동기화: ${n}개 변경 → ${MANIFEST.replace(ROOT + '/', '')}`);
    return;
  }
  if (REPORT) {
    const rows: Status[] = defs.map((d) => {
      const e = manifest.sounds[d.key];
      if (e) return { key: d.key, status: 'kept', detail: `${e.files.length}개 · ${e.license} · ${credits[d.key]?.[0]?.provider ?? ''}` };
      const hasFs = d.sources.some((s) => s.provider === 'freesound');
      return { key: d.key, status: hasFs ? 'pending' : 'missing', detail: hasFs ? 'FREESOUND_API_KEY 필요' : '소스 없음' };
    });
    printReport(rows);
    return;
  }
  const rows: Status[] = [];
  for (const d of defs) {
    process.stdout.write(`▸ ${d.key} … `);
    const r = await handle(d);
    rows.push(r);
    log(r.status === 'kept' ? '유지' : r.status === 'ok' ? '완료' : r.status);
  }
  // 처리 대상 밖의 키 중 파일이 사라진 항목은 manifest 에서 뺀다
  for (const k of Object.keys(manifest.sounds)) {
    if (!manifest.sounds[k]!.files.every((f) => existsSync(resolve(OUT, f)))) { delete manifest.sounds[k]; delete credits[k]; }
  }
  save();
  printReport(rows);
}

main().catch((e) => { console.error(e); process.exit(1); });
