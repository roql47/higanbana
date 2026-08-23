/**
 * 더빙 생성 — 소스에 박힌 대사를 읽어 음성 파일과 매니페스트를 굽는다.
 *
 *   npm run voice:build            # 바뀐 것만
 *   npm run voice:build -- --force # 전부 다시
 *   npm run voice:build -- --list  # 굽지 않고 대사만 출력 (성우용 스크립트 시트)
 *
 * ## 대사를 어디서 읽나
 * **소스가 유일한 원본이다.** 대사를 JSON 으로 한 벌 더 두면 반드시 어긋난다 — 문장을 고치고
 * 음성만 옛것으로 남는 쪽이 자막이 옛것인 쪽보다 훨씬 나쁘다. 그래서 `src/story/*.ts` 에서
 * `id` 와 `text: L('한국어', …)` 가 같은 객체 안에 있는 것만 뽑는다.
 * id 가 붙었는데 문장을 못 읽으면 **조용히 넘기지 않고 실패한다** (그게 드리프트의 시작이다).
 *
 * ## 목소리 일관성
 * `VOICES` 가 한 곳의 진실이다. 인물 → (음성, 속도, 피치) 가 여기서만 정해지고, id 의 앞머리가
 * 인물을 가리킨다(`act1/sayo-run-1` → `sayo`). 같은 인물은 언제 다시 구워도 같은 소리가 난다 —
 * macOS `say` 는 결정적이라 난수가 없다.
 *
 * ## 왜 ElevenLabs 인가
 * 처음엔 macOS `say` 로 뚫었는데 **감정이 없었다**(사용자: 「너무 별론데 감정이 없잖아」).
 * 안내방송을 읽는 기계라 연기가 안 된다. `eleven_v3` 은 본문에 연기 지시를 섞을 수 있다 —
 * 「보지 마!」를 비명으로, 「피안화가 피어 있는 길은…」을 속삭임으로 나눌 수 있다.
 *
 * ## 재현성
 * 줄마다 **id 에서 뽑은 고정 seed** 를 보낸다. 안 주면 같은 문장도 부를 때마다 연기가 달라져서,
 * 한 줄만 다시 구웠는데 그 줄만 톤이 튀는 일이 생긴다. 목소리 자체는 `voiceId` 로 고정된다.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;

/** `.env` 를 읽는다 (이 저장소는 dotenv 를 안 쓴다 — 스크립트마다 한 줄로 충분하다) */
function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const m = readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m?.[1]?.trim() ?? '';
  } catch { return ''; }
}
const KEY = env('ELEVENLABS_API_KEY');
/** 연기 지시(`[shouting]` 등)를 알아듣는 모델. 지시를 안 쓸 거면 eleven_multilingual_v2 가 더 얌전하다 */
const MODEL = 'eleven_v3';
const SRC_DIRS = ['src/story'];
const OUT = join(ROOT, 'public/voice/ko');

/**
 * 인물별 목소리. **여기가 유일한 표다.**
 *
 * `say -v` 의 한국어 음성 중에서 골랐다. 나이·성별이 이름으로 드러나지 않아서 배역으로 적어 둔다.
 *   rate  분당 낱말 수 (기본 175). 외침은 빠르게, 유언 같은 줄은 느리게
 *   pitch 반음 단위 이동 — `say` 에는 없으므로 ffmpeg 로 옮긴다. 어린아이를 만들려면 필요하다
 */
interface VoiceSpec {
  /** ElevenLabs voice_id — 배역이 곧 목소리다. 여기만 고정하면 일관성은 자동 */
  voiceId: string;
  /** 사람이 알아보라고 적어 두는 이름 (API 는 안 본다) */
  voiceName: string;
  /** 0 = 자유롭게(연기 폭 큼) · 0.5 = 자연스럽게 · 1 = 딱딱하게 */
  stability: number;
  similarity: number;
  /** 반음 이동 — 아이 목소리처럼 라이브러리에 없는 배역을 만들 때만 */
  pitch: number;
  gain: number;
  /** 배역 전용 후처리 (거리감 같은 것). 피치 뒤, 정규화 앞에 끼워 넣는다 */
  tone?: string;
  note: string;
}

/**
 * 배역 → 목소리. **여기가 유일한 표다.**
 * 다른 목소리로 바꾸려면 `voiceId` 만 갈면 된다 (`npm run voice:voices` 로 목록을 본다).
 */
const VOICES: Record<string, VoiceSpec> = {
  // 언니(16). 이 게임에서 가장 많이 말하는 목소리 — 또렷하고 보호자다운 쪽으로.
  // 연기 폭이 필요해서(고함부터 속삭임까지) stability 를 낮게 둔다
  sayo: {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', voiceName: 'Sarah',
    stability: 0.35, similarity: 0.8, pitch: 0, gain: 1.0, note: '사요 — 언니, 16세',
  },
  // 어린 미오(6). 라이브러리에 아이 목소리가 없어서 가장 앳된 목소리를 두 반음 올린다
  mio: {
    voiceId: 'cgSgspJ2msm6clMCkdW9', voiceName: 'Jessica',
    stability: 0.4, similarity: 0.8, pitch: 2.0, gain: 1.0, note: '어린 미오 — 6세',
  },
  /**
   * 뒤쫓는 마을 사람들. **빗속 30 m 뒤에서 지르는 소리**라, 목소리보다 거리가 인물을 만든다.
   * 저역·고역을 잘라 「멀리서 외침」의 대역만 남긴다 — 씬에서도 뒤에 있어야 할 소리다.
   */
  back: {
    voiceId: 'SOYHLrjzK2X1ezoPC6cr', voiceName: 'Harry',
    stability: 0.3, similarity: 0.75, pitch: 0, gain: 1.0, note: '뒤쪽 — 마을 사람들의 고함(먼 소리)',
    tone: 'highpass=f=280,lowpass=f=3600,acompressor=threshold=-18dB:ratio=4:attack=5:release=120',
  },
};

/** id 앞머리 → 배역 (`act1/sayo-run-1` → `sayo`) */
function roleOf(id: string): string {
  const tail = id.slice(id.lastIndexOf('/') + 1);
  return tail.split('-')[0]!;
}

// ---------- 대사 추출 ----------

interface Line { id: string; text: string; dir: string; file: string }

/** `id: '...'` 와 같은 객체 안의 `text: L('한국어', …)` 또는 `text: '...'` */
const ID_RE = /id:\s*'([^']+)'/g;

function extract(): Line[] {
  const out: Line[] = [];
  for (const dir of SRC_DIRS) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!f.endsWith('.ts')) continue;
      const path = join(dir, f);
      const src = readFileSync(join(ROOT, path), 'utf8');
      for (const m of src.matchAll(ID_RE)) {
        const id = m[1]!;
        if (!id.includes('/')) continue;   // 더빙 키는 `act/이름` 꼴. 다른 id (조사 지점 등)는 건너뛴다
        // id 뒤 400 자 안에서 같은 줄/객체의 text 를 찾는다
        const win = src.slice(m.index!, m.index! + 400);
        const t = win.match(/text:\s*L\('((?:[^'\\]|\\.)*)'/) ?? win.match(/text:\s*'((?:[^'\\]|\\.)*)'/);
        if (!t) throw new Error(`[voice] ${path}: id '${id}' 에 붙은 text 를 못 찾았다 — 같은 객체 안에 두거나 표(NUDGE 처럼)로 빼라`);
        const d = win.match(/dir:\s*'((?:[^'\\]|\\.)*)'/);
        out.push({ id, text: t[1]!.replace(/\\'/g, "'"), dir: d?.[1] ?? '', file: path });
      }
      // 표 형태 (`{ id: '…', text: L('…', …) }`) 도 위 정규식이 그대로 잡는다
    }
  }
  return out;
}

// ---------- 합성 ----------

/**
 * ElevenLabs 로 한 줄을 굽는다.
 *
 * 연기 지시(`dir`)는 **본문 앞에 대괄호로 붙인다** — `eleven_v3` 은 그걸 읽지 않고 연기로 소화한다.
 * 실측(seed 고정): 「아이를 잡아!」 1.36 s → `[shouting]` 1.20 s (고함은 끊어 지르니 짧아진다).
 * 반대로 뜻 없는 태그(`[qqqzzz]`)는 1.92 s 로 길어졌다 — **모르는 말은 소리 내어 읽는다.**
 * 그러니 `dir` 에는 사람이 알아들을 영어 연기 지시만 쓴다.
 */
async function synth(line: Line, spec: VoiceSpec, outMp3: string) {
  const raw = outMp3.replace(/\.mp3$/, '.raw.mp3');
  mkdirSync(dirname(outMp3), { recursive: true });
  const body = {
    text: line.dir ? `${line.dir} ${line.text}` : line.text,
    model_id: MODEL,
    // 같은 줄은 언제 구워도 같은 연기가 나오게 — 안 주면 한 줄만 다시 구웠을 때 그 줄만 톤이 튄다
    seed: seedOf(line.id),
    voice_settings: {
      stability: spec.stability,
      similarity_boost: spec.similarity,
      use_speaker_boost: true,
    },
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${spec.voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`[voice] ${line.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));

  /**
   * 후처리. ElevenLabs 출력은 이미 깨끗하므로 손을 많이 대지 않는다.
   *   · 피치 — 라이브러리에 없는 배역(아이)을 만들 때만. `asetrate` 은 길이도 바꾸므로 `atempo` 로 되돌린다
   *   · 앞뒤 무음 잘라내기 — 자막 길이(`buffer.duration`)가 실제 낭독과 맞아야 한다
   *   · loudnorm — 줄마다 크기가 들쭉날쭉하면 대사가 아니라 잡음으로 들린다
   */
  const r = Math.pow(2, spec.pitch / 12);
  const filters = [
    'aresample=44100',
    ...(spec.pitch !== 0 ? [`asetrate=44100*${r.toFixed(6)}`, 'aresample=44100', `atempo=${(1 / r).toFixed(6)}`] : []),
    ...(spec.tone ? [spec.tone] : []),
    'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB:detection=peak',
    'areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse',
    'loudnorm=I=-18:TP=-1.5:LRA=11',
  ].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', filters, '-codec:a', 'libmp3lame', '-q:a', '4', outMp3]);
  rmSync(raw, { force: true });
}

/** id → 고정 seed. 문장을 고치면 어차피 해시가 바뀌어 다시 구워지므로 id 만으로 충분하다 */
function seedOf(id: string): number {
  return parseInt(createHash('sha1').update(id).digest('hex').slice(0, 8), 16) % 2147483647;
}

function durationOf(file: string): number {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat(s);
  return Number.isFinite(d) ? Math.round(d * 100) / 100 : 0;
}

/**
 * 키와 권한을 먼저 확인한다. 굽다가 중간에 401 이 나면 절반만 만들어진 채로 끝난다.
 * (이 프로젝트의 키는 **범위가 좁다** — 계정 조회·모델 목록은 막혀 있고 TTS 와 목소리 목록만 열려 있다)
 */
async function preflight() {
  if (!KEY) {
    console.error('[voice] ELEVENLABS_API_KEY 가 없다. .env 에 넣어라 (.env.example 참고)');
    process.exit(1);
  }
  const res = await fetch('https://api.elevenlabs.io/v2/voices?page_size=1', { headers: { 'xi-api-key': KEY } });
  if (!res.ok) {
    console.error(`[voice] 키가 동작하지 않는다 — HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
}

// ---------- 메인 ----------

const args = process.argv.slice(2);
const force = args.includes('--force');
const listOnly = args.includes('--list');

const lines = extract();
if (listOnly) {
  console.log(`# 더빙 스크립트 시트 — ${lines.length} 줄\n`);
  for (const l of lines) {
    const role = roleOf(l.id);
    console.log(`${l.id}\t[${VOICES[role]?.note ?? role}]\t${l.dir || '—'}\t${l.text}`);
  }
  process.exit(0);
}

await preflight();

/**
 * 같은 문장·같은 음성 설정이면 다시 굽지 않는다.
 * `public/` 밖에 둔다 — 거기 두면 빌드가 그대로 복사해서 캐시 파일이 배포에 실린다.
 */
const stampPath = join(ROOT, 'scripts/voice/.stamps-ko.json');
const stamps: Record<string, string> = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, 'utf8')) : {};

const sounds: Record<string, unknown> = {};
let built = 0, skipped = 0;
for (const l of lines) {
  const role = roleOf(l.id);
  const spec = VOICES[role];
  if (!spec) { console.warn(`[voice] 배역 '${role}' 이 VOICES 에 없다 — 건너뜀 (${l.id})`); continue; }
  const rel = `${l.id}.mp3`;
  const abs = join(OUT, rel);
  const stamp = createHash('sha1')
    .update(`${l.text}|${l.dir}|${MODEL}|${spec.voiceId}|${spec.stability}|${spec.similarity}|${spec.pitch}|${spec.tone ?? ''}`)
    .digest('hex').slice(0, 12);
  if (!force && stamps[l.id] === stamp && existsSync(abs)) skipped++;
  else {
    await synth(l, spec, abs);
    stamps[l.id] = stamp; built++;
    console.log(`  ${l.id}  ${l.dir} ${l.text}`);
  }
  sounds[l.id] = { files: [rel], gain: spec.gain, loop: false, license: `ElevenLabs ${MODEL} · ${spec.voiceName}`, durations: [durationOf(abs)] };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(stampPath, JSON.stringify(stamps, null, 1));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  version: 1, generated: new Date().toISOString(), sounds,
}, null, 1));

console.log(`[voice] ko — ${Object.keys(sounds).length} 줄 (새로 구움 ${built} · 그대로 ${skipped}) → public/voice/ko/`);
