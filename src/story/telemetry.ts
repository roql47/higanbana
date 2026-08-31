/**
 * 로컬 플레이테스트 텔레메트리.
 *
 * 네트워크 전송은 전혀 하지 않는다. ACT별 실제 조작 시간, 단서 발견 순서, 사망 원인만
 * localStorage에 최근 24세션까지 남겨 스토리 밀도와 난이도를 판단하는 개발 자료로 쓴다.
 * 일시정지·조사 기록장처럼 main 루프가 멈춘 시간은 update가 호출되지 않아 플레이타임에서 빠진다.
 */

export interface TelemetryEvidence {
  id: string;
  act: number;
  at: number;
}

export interface TelemetryDeath {
  cause: string;
  act: number;
  at: number;
}

export interface TelemetrySession {
  id: string;
  startedAt: number;
  updatedAt: number;
  resumed: boolean;
  startAct: number;
  totalSeconds: number;
  actSeconds: Record<string, number>;
  actVisits: Record<string, number>;
  evidence: TelemetryEvidence[];
  deaths: TelemetryDeath[];
}

interface TelemetryStore {
  v: 1;
  sessions: TelemetrySession[];
}

const KEY = 'higanbana.telemetry.v1';
const MAX_SESSIONS = 24;

function blankStore(): TelemetryStore { return { v: 1, sessions: [] }; }

export class StoryTelemetry {
  private store = this.load();
  private session: TelemetrySession | null = null;
  private active = false;
  private flushT = 0;
  private currentAct = -1;

  constructor() {
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  }

  start(act: number, resumed: boolean) {
    if (this.active) return;
    const now = Date.now();
    const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.session = {
      id, startedAt: now, updatedAt: now, resumed, startAct: act,
      totalSeconds: 0, actSeconds: {}, actVisits: { [String(act)]: 1 }, evidence: [], deaths: [],
    };
    this.currentAct = act;
    this.active = true;
    this.store.sessions.push(this.session);
    if (this.store.sessions.length > MAX_SESSIONS) this.store.sessions.splice(0, this.store.sessions.length - MAX_SESSIONS);
    this.flush();
  }

  update(dt: number, act: number) {
    const s = this.session;
    if (!this.active || !s || !Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.1);
    if (act !== this.currentAct) {
      this.currentAct = act;
      const key = String(act);
      s.actVisits[key] = (s.actVisits[key] ?? 0) + 1;
      this.flush();
    }
    const key = String(act);
    s.totalSeconds += safeDt;
    s.actSeconds[key] = (s.actSeconds[key] ?? 0) + safeDt;
    this.flushT += safeDt;
    if (this.flushT >= 15) this.flush();
  }

  recordEvidence(id: string, act: number) {
    const s = this.session;
    if (!this.active || !s || s.evidence.some((e) => e.id === id)) return;
    s.evidence.push({ id, act, at: s.totalSeconds });
    this.flush();
  }

  recordDeath(cause: string, act: number) {
    const s = this.session;
    if (!this.active || !s) return;
    s.deaths.push({ cause, act, at: s.totalSeconds });
    this.flush();
  }

  flush() {
    if (!this.session) return;
    this.session.updatedAt = Date.now();
    this.flushT = 0;
    try { localStorage.setItem(KEY, JSON.stringify(this.store)); } catch { /* 저장 불가 환경에서는 이번 세션만 유지 */ }
  }

  /** 개발 HUD·콘솔용 요약. 원본 객체를 노출하지 않는다. */
  report(): TelemetrySession | null {
    return this.session ? JSON.parse(JSON.stringify(this.session)) as TelemetrySession : null;
  }

  debugLine() {
    const s = this.session;
    if (!s) return 'telemetry idle';
    const actSec = s.actSeconds[String(this.currentAct)] ?? 0;
    return `play ${format(s.totalSeconds)} · act${this.currentAct} ${format(actSec)} · clues ${s.evidence.length} · deaths ${s.deaths.length}`;
  }

  /** DEV 콘솔에서 반복 QA 데이터를 비울 때만 사용한다. */
  clear() {
    this.store = blankStore();
    this.session = null;
    this.active = false;
    this.currentAct = -1;
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }

  private load(): TelemetryStore {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as TelemetryStore | null;
      if (parsed?.v === 1 && Array.isArray(parsed.sessions)) return parsed;
    } catch { /* 손상된 데이터는 새로 시작 */ }
    return blankStore();
  }
}

function format(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
