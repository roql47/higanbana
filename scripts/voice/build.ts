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
 * ## 왜 macOS `say` 인가
 * 무료·오프라인·결정적이고 한국어 음성이 9 종 있다. 상용 TTS 로 갈아탈 때는 `synth()` 하나만
 * 바꾸면 된다 — 나머지(대사 추출·해시 캐시·매니페스트)는 그대로다.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
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
  voice: string; rate: number; pitch: number; gain: number; note: string;
  /** 배역 전용 후처리 (거리감·확성기 같은 것). 피치·정규화 앞에 끼워 넣는다 */
  tone?: string;
}

/**
 * ⚠️ **이 맥에 실제로 설치된 한국어 음성은 `Yuna` 하나뿐이다.**
 * `say -v '?'` 가 9 종을 나열하지만 나머지 8 종은 *내려받을 수 있다*는 목록이라, 그대로 쓰면
 * 0.016 초짜리 무음이 조용히 만들어진다(실측). 그래서 아래 `preflight()` 가 먼저 확인하고,
 * 없는 음성을 쓰면 굽지 않고 멈춘다.
 *
 * 지금은 **한 음성에서 피치·속도·음색으로 배역을 갈랐다.** 자리 채우기용으로는 통하지만
 * 남자 목소리는 남자로 들리지 않는다 — 진짜로 나눠 쓰려면 음성을 더 받아야 한다:
 *   시스템 설정 → 손쉬운 사용 → 음성 콘텐츠 → 한국어에서 원하는 음성 다운로드
 * 받고 나면 이 표의 `voice` 만 바꾸면 된다.
 */
const VOICES: Record<string, VoiceSpec> = {
  // 언니(16). 이 게임에서 가장 많이 말하는 목소리 — 따뜻하고 또렷한 쪽으로
  sayo: { voice: 'Yuna', rate: 190, pitch: 0.5, gain: 1.0, note: '사요 — 언니, 16세' },
  // 어린 미오(6). 같은 음성을 위로 올리고 느리게 — 아이는 빨리 말하지 않는다
  mio: { voice: 'Yuna', rate: 158, pitch: 4.0, gain: 1.0, note: '어린 미오 — 6세' },
  /**
   * 뒤쫓는 마을 사람들. **빗속 30 m 뒤에서 지르는 소리**라, 목소리 자체보다 거리가 인물을 만든다.
   * 저역을 깎고 고역을 잘라 「멀리서 외침」의 대역만 남긴다 — 그래야 피치만 내린 티가 덜 난다.
   */
  back: {
    voice: 'Yuna', rate: 212, pitch: -5.5, gain: 1.0, note: '뒤쪽 — 마을 사람들의 고함(먼 소리)',
    tone: 'highpass=f=320,lowpass=f=3400,acompressor=threshold=-18dB:ratio=4:attack=5:release=120',
  },
};

/** id 앞머리 → 배역 (`act1/sayo-run-1` → `sayo`) */
function roleOf(id: string): string {
  const tail = id.slice(id.lastIndexOf('/') + 1);
  return tail.split('-')[0]!;
}

// ---------- 대사 추출 ----------

interface Line { id: string; text: string; file: string }

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
        out.push({ id, text: t[1]!.replace(/\\'/g, "'"), file: path });
      }
      // 표 형태 (`{ id: '…', text: L('…', …) }`) 도 위 정규식이 그대로 잡는다
    }
  }
  return out;
}

// ---------- 합성 ----------

function synth(text: string, spec: VoiceSpec, outMp3: string) {
  const tmp = outMp3.replace(/\.mp3$/, '.aiff');
  mkdirSync(dirname(outMp3), { recursive: true });
  // `say` 는 결정적이다 — 같은 입력이면 같은 파일이 나온다.
  // (`--data-format=LEF32@…` 는 쓰지 않는다: AIFF 는 빅엔디안이라 「Opening output file failed: fmt?」로 죽는다.
  //  기본 포맷으로 받아 ffmpeg 이 읽게 두는 편이 안전하다)
  execFileSync('say', ['-v', spec.voice, '-r', String(spec.rate), '-o', tmp, text]);
  /**
   * 피치 이동 + mp3.
   * `asetrate` 로 올리면 길이가 같이 짧아지므로 `atempo` 로 되돌린다 (길이 보존 피치 시프트).
   * 끝의 무음을 잘라야 자막 길이(`buffer.duration`)가 실제 낭독과 맞는다.
   */
  const r = Math.pow(2, spec.pitch / 12);
  const filters = [
    /**
     * ⚠️ **먼저 44100 으로 맞춘다.** `say` 는 22050 Hz 로 내보내는데 `asetrate` 는 *현재* 표본율을
     * 다시 해석하는 필터라, 44100 을 가정하고 걸면 그것만으로 2 배속이 된다 —
     * 실측: 2.87 초짜리 낭독이 1.43 초로 잘려 나왔다(자막이 반쯤 찍히다 넘어갔다).
     */
    `aresample=44100`,
    `asetrate=44100*${r.toFixed(6)}`,
    `aresample=44100`,
    `atempo=${(1 / r).toFixed(6)}`,
    ...(spec.tone ? [spec.tone] : []),
    `silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB:detection=peak`,
    `areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse`,
    `loudnorm=I=-18:TP=-1.5:LRA=11`,
  ].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-af', filters, '-codec:a', 'libmp3lame', '-q:a', '4', outMp3]);
  rmSync(tmp, { force: true });
}

function durationOf(file: string): number {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat(s);
  return Number.isFinite(d) ? Math.round(d * 100) / 100 : 0;
}

/**
 * **설치되지 않은 음성을 미리 걸러낸다.**
 *
 * `say` 는 없는 음성을 줘도 실패하지 않고 0.016 초짜리 빈 파일을 뱉는다. 그대로 두면 무음 mp3 가
 * 매니페스트에 실리고, 게임에서는 「자막이 한 글자도 안 찍히고 넘어가는 줄」로 나타난다 —
 * 원인을 오디오가 아니라 자막 코드에서 찾게 되는 종류의 버그다. 그래서 굽기 전에 한 번 소리를 낸다.
 */
function preflight() {
  const bad: string[] = [];
  const probe = '/tmp/.voice-probe.aiff';
  for (const v of [...new Set(Object.values(VOICES).map((s) => s.voice))]) {
    try {
      execFileSync('say', ['-v', v, '-o', probe, '테스트'], { stdio: 'ignore' });
      if (durationOf(probe) < 0.15) bad.push(v);
    } catch { bad.push(v); }
  }
  rmSync(probe, { force: true });
  if (bad.length) {
    console.error(`[voice] 설치되지 않은 음성: ${bad.join(', ')}`);
    console.error('        시스템 설정 → 손쉬운 사용 → 음성 콘텐츠 → 한국어에서 내려받거나,');
    console.error('        scripts/voice/build.ts 의 VOICES 에서 설치된 음성으로 바꿔라.');
    console.error(`        지금 이 맥에서 소리가 나는 것: ${installedKoVoices().join(', ') || '(없음)'}`);
    process.exit(1);
  }
}

/** 실제로 소리가 나는 한국어 음성만 (오류 메시지에 쓴다) */
function installedKoVoices(): string[] {
  const probe = '/tmp/.voice-probe2.aiff';
  const list = execFileSync('say', ['-v', '?'], { encoding: 'utf8' })
    .split('\n').filter((l) => /\bko_KR\b/.test(l)).map((l) => l.split(/\s{2,}|\s+\(/)[0]!.trim());
  const ok: string[] = [];
  for (const v of list) {
    try {
      execFileSync('say', ['-v', v, '-o', probe, '테스트'], { stdio: 'ignore' });
      if (durationOf(probe) >= 0.15) ok.push(v);
    } catch { /* 없는 음성 */ }
  }
  rmSync(probe, { force: true });
  return ok;
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
    console.log(`${l.id}\t[${VOICES[role]?.note ?? role}]\t${l.text}`);
  }
  process.exit(0);
}

preflight();

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
  const stamp = createHash('sha1').update(`${l.text}|${spec.voice}|${spec.rate}|${spec.pitch}|${spec.tone ?? ''}`).digest('hex').slice(0, 12);
  if (!force && stamps[l.id] === stamp && existsSync(abs)) skipped++;
  else { synth(l.text, spec, abs); stamps[l.id] = stamp; built++; }
  sounds[l.id] = { files: [rel], gain: spec.gain, loop: false, license: 'macOS say (TTS)', durations: [durationOf(abs)] };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(stampPath, JSON.stringify(stamps, null, 1));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  version: 1, generated: new Date().toISOString(), sounds,
}, null, 1));

console.log(`[voice] ko — ${Object.keys(sounds).length} 줄 (새로 구움 ${built} · 그대로 ${skipped}) → public/voice/ko/`);
