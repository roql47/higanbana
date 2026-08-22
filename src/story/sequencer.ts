import * as THREE from 'three';
import type { Dialogue, DialogueLine } from './dialogue';

/**
 * 인게임 시퀀서 (PLAN-STORY §8.3) — 프리렌더 영상 0개 원칙의 본체.
 *
 * 트랙: 카메라 스플라인(위치·시선 카트멀롬, FOV 보간) / 자막 / 페이드 / 임의 훅(fn).
 * B등급(조작 회수) 연출 전용 — A등급(인터랙티브)은 시퀀서 없이 dialogue·quests 를 직접 쓴다.
 *
 * 스킵: Space 홀드 0.7 s. 스킵 시 남은 fn 이벤트는 전부 실행한다(상태 변경이 fn 에 있으므로
 * 스킵해도 월드가 같은 결말에 도달해야 한다) — fn 은 "여러 번 불려도 되는" 멱등이어야 한다.
 *
 * 개발용 스크러버(DEV): 재생/일시정지·타임 슬라이더·배속. 스크럽은 **카메라 전용**이고
 * 이벤트는 전진 재생에서만 발화한다 — 부작용 있는 fn 을 되감기로 재실행하지 않기 위해서다.
 */

export interface CamKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

export type SeqEvent =
  | { t: number; sub: DialogueLine }
  | { t: number; fade: 'in' | 'out'; dur?: number } // in = 암전, out = 밝아짐
  | { t: number; fn: () => void };

export interface Sequence {
  id: string;
  duration: number;
  /** 2개 이상이면 카메라를 가져간다. 없으면 카메라는 게임 것 그대로 (연출만 얹기) */
  cam?: CamKey[];
  events?: SeqEvent[];
  /** 기본: cam 이 있으면 true */
  letterbox?: boolean;
  /** 기본 true */
  skippable?: boolean;
}

export class Sequencer {
  private seq: Sequence | null = null;
  private t = 0;
  private fi = 0;
  private events: SeqEvent[] = [];
  private posCurve: THREE.CatmullRomCurve3 | null = null;
  private lookCurve: THREE.CatmullRomCurve3 | null = null;
  private keys: CamKey[] = [];
  private baseFov = 55;
  private done: (() => void) | null = null;
  private lookTmp = new THREE.Vector3();

  // 스킵 홀드
  private holding = false;
  private skipHold = 0;

  // DOM
  private lbTop: HTMLElement;
  private lbBottom: HTMLElement;
  private fadeEl: HTMLElement;
  private skipEl: HTMLElement;
  private skipBar: HTMLElement;

  // 개발용 스크러버
  private scrub: HTMLElement | null = null;
  private scrubRange: HTMLInputElement | null = null;
  private scrubTime: HTMLElement | null = null;
  private paused = false;
  private speed = 1;

  constructor(private camera: THREE.PerspectiveCamera, private dialogue: Dialogue) {
    const mk = (cls: string, parent = document.body) => {
      const el = document.createElement('div'); el.className = cls; parent.appendChild(el); return el;
    };
    this.lbTop = mk('letterbox top');
    this.lbBottom = mk('letterbox bottom');
    this.fadeEl = mk('seq-fade');
    this.skipEl = mk('seq-skip');
    this.skipEl.innerHTML = '<span>SPACE 꾹 — 넘기기</span><div class="bar"><i></i></div>';
    this.skipBar = this.skipEl.querySelector('i') as HTMLElement;
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && this.active) { this.holding = true; e.preventDefault(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.holding = false; });
    if (import.meta.env.DEV) this.buildScrubber();
  }

  get active() { return this.seq !== null; }
  get time() { return this.t; }

  play(seq: Sequence): Promise<void> {
    if (this.seq) this.end(); // 겹침 방지 — 이전 것을 정리하고 시작
    this.seq = seq;
    this.t = 0; this.fi = 0; this.paused = false; this.speed = 1; this.skipHold = 0;
    this.events = [...(seq.events ?? [])].sort((a, b) => a.t - b.t);
    this.keys = seq.cam && seq.cam.length >= 2 ? seq.cam : [];
    if (this.keys.length) {
      this.posCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => new THREE.Vector3(...k.pos)), false, 'catmullrom', 0.5);
      this.lookCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => new THREE.Vector3(...k.look)), false, 'catmullrom', 0.5);
      this.baseFov = this.camera.fov;
      this.evalCam();
    } else { this.posCurve = this.lookCurve = null; }
    const lb = seq.letterbox ?? this.keys.length > 0;
    this.lbTop.classList.toggle('show', lb);
    this.lbBottom.classList.toggle('show', lb);
    if (seq.skippable ?? true) this.skipEl.classList.add('show');
    if (this.scrub) { this.scrub.style.display = 'flex'; this.scrubRange!.max = String(Math.round(seq.duration * 1000)); }
    return new Promise((r) => { this.done = r; });
  }

  update(dt: number) {
    const seq = this.seq;
    if (!seq) return;
    // 스킵 홀드
    if (this.holding && (seq.skippable ?? true)) {
      this.skipHold += dt;
      if (this.skipHold >= 0.7) { this.skip(); return; }
    } else this.skipHold = Math.max(0, this.skipHold - dt * 3);
    this.skipBar.style.width = `${Math.min(100, (this.skipHold / 0.7) * 100)}%`;

    if (!this.paused) this.t += dt * this.speed;
    while (this.fi < this.events.length && this.events[this.fi]!.t <= this.t) this.fire(this.events[this.fi++]!);
    if (this.posCurve) this.evalCam();
    if (this.scrubRange && !this.scrubbing) {
      this.scrubRange.value = String(Math.round(this.t * 1000));
      this.scrubTime!.textContent = `${this.t.toFixed(1)} / ${seq.duration.toFixed(1)}s ×${this.speed}`;
    }
    if (this.t >= seq.duration) this.end();
  }

  /** 남은 fn 이벤트를 전부 실행하고 종료 — 스킵해도 월드는 같은 결말에 도달한다 */
  skip() {
    if (!this.seq) return;
    for (let i = this.fi; i < this.events.length; i++) {
      const e = this.events[i]!;
      if ('fn' in e) e.fn();
    }
    this.dialogue.clear();
    this.setFade(0, 0.5);
    this.end();
  }

  /** 화면 페이드 — 시퀀스 밖(사망·전환 연출)에서도 쓸 수 있게 공개 */
  setFade(opacity: number, dur: number) {
    this.fadeEl.style.transitionDuration = `${dur}s`;
    this.fadeEl.style.opacity = String(opacity);
  }

  private fire(e: SeqEvent) {
    if ('sub' in e) void this.dialogue.say(e.sub);
    else if ('fade' in e) this.setFade(e.fade === 'in' ? 1 : 0, e.dur ?? 1);
    else e.fn();
  }

  private evalCam() {
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1]!.t <= this.t) i++;
    const a = keys[i]!, b = keys[i + 1]!;
    const s = THREE.MathUtils.clamp((this.t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
    // 곡선은 키 인덱스 균일 매개변수 — 시간 배분은 키의 t 가, 공간 모양은 카트멀롬이 정한다
    const u = (i + s) / (keys.length - 1);
    this.camera.position.copy(this.posCurve!.getPoint(u));
    this.camera.lookAt(this.lookCurve!.getPoint(u, this.lookTmp));
    const fa = a.fov ?? this.baseFov, fb = b.fov ?? this.baseFov;
    const fov = fa + (fb - fa) * s;
    if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  private end() {
    if (!this.seq) return;
    this.seq = null;
    this.lbTop.classList.remove('show');
    this.lbBottom.classList.remove('show');
    this.skipEl.classList.remove('show');
    this.skipBar.style.width = '0';
    if (this.scrub) this.scrub.style.display = 'none';
    if (this.posCurve) { this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); }
    this.posCurve = this.lookCurve = null;
    const d = this.done; this.done = null; d?.();
  }

  // --- 개발용 스크러버 (컷신 저작이 코드보다 비싸다는 §11 대응 — 카메라 반복 수정용) ---
  private scrubbing = false;
  private buildScrubber() {
    const el = document.createElement('div');
    el.className = 'seq-scrub';
    el.style.display = 'none';
    el.innerHTML = '<button data-a="pp">⏸</button><input type="range" min="0" max="1000" value="0" step="10" /><span class="tm">0.0s</span><button data-a="sp">×1</button>';
    document.body.appendChild(el);
    this.scrub = el;
    this.scrubRange = el.querySelector('input') as HTMLInputElement;
    this.scrubTime = el.querySelector('.tm') as HTMLElement;
    const pp = el.querySelector('[data-a=pp]') as HTMLButtonElement;
    const sp = el.querySelector('[data-a=sp]') as HTMLButtonElement;
    pp.addEventListener('click', () => { this.paused = !this.paused; pp.textContent = this.paused ? '▶' : '⏸'; });
    sp.addEventListener('click', () => {
      this.speed = this.speed === 1 ? 4 : this.speed === 4 ? 0.25 : 1;
      sp.textContent = `×${this.speed}`;
    });
    this.scrubRange.addEventListener('pointerdown', () => { this.scrubbing = true; this.paused = true; pp.textContent = '▶'; });
    this.scrubRange.addEventListener('pointerup', () => { this.scrubbing = false; });
    this.scrubRange.addEventListener('input', () => {
      this.t = Number(this.scrubRange!.value) / 1000;
      if (this.posCurve) this.evalCam();
      this.scrubTime!.textContent = `${this.t.toFixed(1)}s (스크럽)`;
    });
  }
}
