import * as THREE from 'three';
import { settings } from '@/core/settings';
import type { Sfx } from './sfx';
import type { LoopVoice } from './bank';

/** 앰비언스가 알아야 하는 마을 정보 (Village 에서 뽑아 넘긴다) */
export interface AmbienceWorld {
  /** 논 마스크 0..1 */
  paddyMask(x: number, z: number): number;
  /** 지형 높이 — 2.2 m 이상이 삼나무 숲 */
  heightAt(x: number, z: number): number;
  isIndoors(p: THREE.Vector3): boolean;
  /** 폐가 현관 (풍경이 달린 툇마루) */
  house: THREE.Vector3;
  /** 신사 중심 (범종은 그 너머 먼 절에서) */
  shrine: THREE.Vector3;
}

interface Bed {
  key: string; voice: LoopVoice | null; weight: (w: ZoneWeights) => number; cur: number;
  /** 느린 무작위 흔들림 [최소, 최대] — 합창이 밀려왔다 밀려가는 느낌. 일정한 벽처럼 들리지 않게 */
  wander: [number, number]; wv: number; wt: number; wtimer: number;
}
interface ZoneWeights { forest: number; paddy: number; indoors: number }

/**
 * 여름밤 앰비언스 — **실녹음 루프를 구역 가중치로 섞는다.** (샘플이 없는 키는 조용히 건너뛰고, Sfx 의 합성 원샷이 폴백)
 *
 *   바탕(무지향 스테레오). 루프마다 느린 무작위 흔들림(wander)을 곱해 "밀려왔다 밀려가는" 합창으로 만든다.
 *   짧은 녹음(귀뚜라미 9 s·방울벌레 13 s)은 scatter 모드 — 무작위 조각을 이어 붙여 반복 패턴이 안 들린다
 *     wind       밤바람          어디서나 · 실내 ×0.35 (샘플 없으면 Sfx 의 합성 바람)
 *     crickets   귀뚜라미         어디서나 · 실내 ×0.5
 *     suzumushi  방울벌레·풀벌레   들판·논두렁에서, 숲으로 갈수록 줄어듦
 *     higurashi  쓰르라미 합창     삼나무 숲·신사 언덕 쪽에서. 멀리서 가끔 밀려오는 정도 (wander 0.1~1)
 *     frogs      개구리           논 가까이서 크게, 멀어지면 배경으로
 *   실내에서는 전체에 로우패스(벽 너머 소리)
 *
 *   원샷(위치 있음, HRTF):
 *     furin      풍경 — 폐가 툇마루에서 5~18 s 마다
 *     bonsho     먼 절의 범종 — 2~4 분에 한 번, 신사 너머 북쪽에서 아주 작게
 *     hototogisu/owl  밤새 — 40~90 s 마다 숲 속 임의 지점
 */
export class Ambience {
  private beds: Bed[] = [];
  private bus: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private started = false;
  private furinPanner: PannerNode | null = null;
  private farPanner: PannerNode | null = null;
  private birdPanner: PannerNode | null = null;
  private furinT = 6 + Math.random() * 6;
  private bonshoT = 90 + Math.random() * 90;
  private birdT = 25 + Math.random() * 30;
  private tmp = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(private sfx: Sfx, private world: AmbienceWorld) { sfx.sampleAmbience = true; }

  /** 컨텍스트가 돌고 샘플 뱅크가 준비되면 바탕 루프를 한 번만 시작 */
  private ensure(): boolean {
    if (this.started) return true;
    const ctx = this.sfx.context, master = this.sfx.masterGain;
    if (!ctx || !master || ctx.state !== 'running' || !this.sfx.bank.ready) return false;
    this.started = true;
    const bank = this.sfx.bank;
    this.bus = ctx.createGain(); this.bus.gain.value = 1;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5;
    this.bus.connect(this.lp).connect(master);
    const defs: { key: string; weight: Bed['weight']; wander: [number, number]; scatter?: [number, number] }[] = [
      { key: 'amb/wind', weight: (w) => 1 - 0.65 * w.indoors, wander: [0.5, 1], scatter: [6, 12] },
      { key: 'amb/crickets', weight: (w) => 1 - 0.5 * w.indoors, wander: [0.6, 1], scatter: [2.5, 5] },
      { key: 'amb/suzumushi', weight: (w) => (1 - 0.55 * w.forest) * (1 - 0.6 * w.indoors), wander: [0.5, 1], scatter: [3, 6] },
      { key: 'amb/higurashi', weight: (w) => (0.3 + 0.7 * w.forest) * (1 - 0.5 * w.indoors), wander: [0.1, 1] },
      { key: 'amb/frogs', weight: (w) => (0.1 + 0.9 * w.paddy) * (1 - 0.7 * w.indoors), wander: [0.4, 1] },
    ];
    for (const d of defs) {
      if (!bank.has(d.key)) continue;
      // 페이드인은 update() 의 가중치 스무딩이 맡는다 (gain 파라미터에 자동화와 직접 대입을 섞지 않는다)
      const voice = bank.loop(d.key, { dest: this.bus, at: Math.random() * 0.5, mode: d.scatter ? 'scatter' : undefined, grain: d.scatter });
      if (voice) voice.gain.gain.value = 0;
      const w0 = d.wander[0] + Math.random() * (d.wander[1] - d.wander[0]);
      this.beds.push({ key: d.key, voice, weight: d.weight, cur: 0, wander: d.wander, wv: w0, wt: w0, wtimer: 4 + Math.random() * 10 });
    }
    const mkPanner = (ref: number, roll: number, max: number) => {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'exponential'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
      p.connect(this.bus!);
      return p;
    };
    this.furinPanner = mkPanner(1.6, 1.3, 80);
    const h = this.world.house;
    this.furinPanner.positionX.value = h.x; this.furinPanner.positionY.value = h.y + 2.3; this.furinPanner.positionZ.value = h.z;
    this.farPanner = mkPanner(40, 0.5, 1000); // 먼 절: 거리에 거의 무관, 방향만
    const s = this.world.shrine;
    this.farPanner.positionX.value = s.x; this.farPanner.positionY.value = s.y + 12; this.farPanner.positionZ.value = s.z - 90;
    this.birdPanner = mkPanner(6, 1.1, 120);
    console.info('[ambience] 바탕', this.beds.map((b) => b.key.replace('amb/', '')).join(' '), '· 원샷', ['amb/furin', 'amb/bonsho', 'amb/hototogisu', 'amb/owl'].filter((k) => bank.has(k)).map((k) => k.replace('amb/', '')).join(' '));
    return true;
  }

  /** 리스너 = 카메라 (matsuri.ts 도 같은 값을 쓴다 — 중복 설정은 무해) */
  private updateListener(ctx: AudioContext, camera: THREE.Camera) {
    const l = ctx.listener;
    if (!l.positionX) return;
    const cp = camera.position;
    this.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    l.positionX.value = cp.x; l.positionY.value = cp.y; l.positionZ.value = cp.z;
    l.forwardX.value = this.fwd.x; l.forwardY.value = this.fwd.y; l.forwardZ.value = this.fwd.z;
    l.upX.value = this.up.x; l.upY.value = this.up.y; l.upZ.value = this.up.z;
  }

  private zoneWeights(p: THREE.Vector3): ZoneWeights {
    // 숲: 반경 12 m 8방향 + 자기 자리의 최대 지형 높이 (삼나무는 2.2 m 이상 지대에만 심겨 있다)
    let hmax = this.world.heightAt(p.x, p.z);
    let paddy = this.world.paddyMask(p.x, p.z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12;
      hmax = Math.max(hmax, this.world.heightAt(x, z));
      paddy = Math.max(paddy, this.world.paddyMask(p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7) * 0.85);
    }
    return {
      forest: THREE.MathUtils.smoothstep(hmax, 1.2, 4.5),
      paddy: THREE.MathUtils.clamp(paddy, 0, 1),
      indoors: this.world.isIndoors(p) ? 1 : 0,
    };
  }

  update(dt: number, playerPos: THREE.Vector3, camera: THREE.Camera) {
    if (!this.ensure()) return;
    const ctx = this.sfx.context!;
    this.updateListener(ctx, camera);
    const w = this.zoneWeights(playerPos);
    // 슬라이더(settings.audio.ambient, 기본 0.12)를 기준 1.0 으로 쓰는 배율
    const level = settings.audio.ambient / 0.12;
    const k = Math.min(1, dt * 1.5);
    for (const b of this.beds) {
      if (!b.voice) continue;
      // wander: 10~30 s 마다 새 목표를 뽑고 6 s 시정수로 따라간다 → 합창이 밀려왔다 밀려간다
      b.wtimer -= dt;
      if (b.wtimer <= 0) { b.wtimer = 10 + Math.random() * 20; b.wt = b.wander[0] + Math.random() * (b.wander[1] - b.wander[0]); }
      b.wv += (b.wt - b.wv) * Math.min(1, dt / 6);
      const target = b.weight(w) * level * b.wv;
      b.cur += (target - b.cur) * k;
      b.voice.gain.gain.value = b.cur;
    }
    // 실내: 벽 너머로 듣는 느낌
    this.lp!.frequency.setTargetAtTime(w.indoors ? 700 : 20000, ctx.currentTime, 0.4);
    this.bus!.gain.setTargetAtTime(w.indoors ? 0.7 : 1, ctx.currentTime, 0.4);

    const bank = this.sfx.bank;
    // 풍경 — 폐가 툇마루. 가까울수록 자주(바람에 흔들리는 느낌은 랜덤 간격으로)
    this.furinT -= dt;
    if (this.furinT <= 0 && bank.has('amb/furin')) {
      const d = playerPos.distanceTo(this.world.house);
      this.furinT = (d < 12 ? 4 : 7) + Math.random() * 9;
      if (d < 70) bank.play('amb/furin', { gain: (0.45 + Math.random() * 0.55) * level, rate: 0.97 + Math.random() * 0.06, dest: this.furinPanner! });
    }
    // 먼 절의 범종 — 2~4 분에 한 번. 북쪽 멀리서, 로우패스
    this.bonshoT -= dt;
    if (this.bonshoT <= 0 && bank.has('amb/bonsho')) {
      this.bonshoT = 120 + Math.random() * 120;
      bank.play('amb/bonsho', { gain: 0.35 * level, rate: 0.94 + Math.random() * 0.04, lp: 1400, dest: this.farPanner! });
    }
    // 밤새 — 숲 속 임의 지점에서
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 40 + Math.random() * 50;
      const key = bank.has('amb/hototogisu') && (!bank.has('amb/owl') || Math.random() < 0.5) ? 'amb/hototogisu' : bank.has('amb/owl') ? 'amb/owl' : null;
      if (key) {
        const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 18;
        this.tmp.set(playerPos.x + Math.cos(a) * r, 0, playerPos.z + Math.sin(a) * r);
        this.tmp.y = this.world.heightAt(this.tmp.x, this.tmp.z) + 5 + Math.random() * 4;
        this.birdPanner!.positionX.value = this.tmp.x; this.birdPanner!.positionY.value = this.tmp.y; this.birdPanner!.positionZ.value = this.tmp.z;
        bank.play(key, { gain: (0.5 + Math.random() * 0.4) * level, rate: 0.96 + Math.random() * 0.08, dest: this.birdPanner! });
      }
    }
  }
}
