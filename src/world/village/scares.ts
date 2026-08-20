import * as THREE from 'three';
import { Props } from '@/world/props';
import type { Landmarks } from './landmarks';
import type { MatsuriSquare } from './matsuri';
import type { House } from './house';
import type { Chochin } from '@/light/chochin';
import type { Sfx } from '@/audio/sfx';
import type { Senses } from '@/ai/senses';

/**
 * 연출형 요괴 — 추격 AI 없이 1회성/상시 스크립트로 공포를 만든다.
 *  1) 움직이는 지장: 플레이어가 여섯 지장을 **안 볼 때만** 한 구가 미묘하게 돌아가거나 한 걸음 옮겨 있다
 *  2) 놋페라보: 노점 뒤에 등 돌린 채 서 있다 → 3.5 m 안으로 다가가면 돌아본다 → 얼굴이 없다 → 1.2 s 뒤 사라짐. 1회성
 *  3) 초칭오바케: 위협 근접 중(요괴 8 m 이내) 무작위로 내 초칭에 0.45 s 동안 눈이 뜬다. 쿨다운 40 s
 */
export class Scares {
  private noppera: THREE.Object3D | null = null;
  private nopperaStall: { pos: THREE.Vector3; yaw: number } | null = null;
  private nopperaState: 'waiting' | 'turning' | 'gone' = 'waiting';
  private nopperaT = 0;
  private nopperaYaw0 = 0;
  private jizoT = 0;
  private eyeMat: THREE.MeshStandardMaterial | null = null;
  private eyeMesh: THREE.Mesh | null = null;
  private eyeT = 0;
  private eyeCooldown = 25;
  private tmp = new THREE.Vector3();
  // 야구라 북
  private drumT = 30;
  private drumPanner: PannerNode | null = null;
  // 이로리 불씨
  private emberLight: THREE.PointLight | null = null;
  private emberMat: THREE.MeshStandardMaterial | null = null;
  private emberT = 0;
  private emberFlared = false;
  private emberFlare = 0;
  // 로쿠로쿠비
  private rokuro: THREE.Group | null = null;
  private rokuroNeck: THREE.Mesh | null = null;
  private rokuroState: 'waiting' | 'playing' | 'done' = 'waiting';
  private rokuroT = 0;
  private rokuroLight: THREE.PointLight | null = null;

  constructor(
    private scene: THREE.Scene,
    private landmarks: Landmarks,
    private square: MatsuriSquare,
    private house: House,
    private chochin: Chochin | null,
    private sfx: Sfx,
    private senses: Senses | null,
  ) {}

  async load() {
    // 놋페라보: 노점 중 하나의 카운터 뒤, 광장 중심을 등진 채
    const stall = this.square.stalls[2] ?? this.square.stalls[0];
    if (stall) {
      const g = await Props.loader().loadAsync('/models/yokai-noppera.glb');
      const root = g.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.6 / Math.max(0.01, size.y);
      root.scale.setScalar(s);
      root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
      const wrap = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.y = -Math.PI / 2; // Tripo 정면 +X → +Z
      inner.add(root);
      wrap.add(inner);
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      // 달걀 얼굴: Tripo 가 "사람 얼굴"로 보정해 희미한 눈코입을 그려넣었다 → 머리 앞면에
      // 매끈한 살색 타원체를 덮어 지운다 (정면 +Z 기준, 키 1.6 m 에서 얼굴 중심 ≈ 1.47 m)
      const egg = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xe9cdb2, roughness: 0.55, metalness: 0 }),
      );
      egg.scale.set(1.0, 1.32, 0.62);
      egg.position.set(0, 1.47, 0.06);
      egg.castShadow = false;
      wrap.add(egg);
      // 카운터 뒤(광장 반대쪽 0.9 m) — 등을 보인다 (yaw = 노점 yaw + π)
      const back = new THREE.Vector3(-Math.sin(stall.yaw), 0, -Math.cos(stall.yaw)).multiplyScalar(0.9);
      wrap.position.copy(stall.pos).add(back);
      wrap.rotation.y = stall.yaw + Math.PI;
      this.nopperaYaw0 = wrap.rotation.y;
      this.scene.add(wrap);
      this.noppera = wrap;
      this.nopperaStall = stall;
    }
    // 초칭오바케: 초칭 종이 위에 덮는 눈 데칼(작은 평면). 평소엔 투명
    if (this.chochin) {
      const tex = await new THREE.TextureLoader().loadAsync('/textures/chochin-eye.webp');
      tex.colorSpace = THREE.SRGBColorSpace;
      this.eyeMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, emissive: new THREE.Color(0xffd090), emissiveIntensity: 0.35, emissiveMap: tex, depthWrite: false, side: THREE.DoubleSide });
      const size = 0.34;
      this.eyeMesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.46, size * 0.30), this.eyeMat);
      // 초칭 몸통 앞면(+Z 쪽, 플레이어 뒤에서 보는 카메라 기준 바깥)에 붙인다
      this.eyeMesh.position.set(0, 0.02, size * 0.31);
      this.eyeMesh.renderOrder = 5;
      this.chochin.body.add(this.eyeMesh);
    }
  }

  /** 이로리 불씨 + 로쿠로쿠비 실루엣 준비 (지오메트리 전용 — load 와 별개로 동기) */
  setupHouse() {
    // --- 이로리 불씨: 꺼진 지 오래여야 할 화덕에 잉걸불이 살아 있다 ---
    const coals = new THREE.Group();
    this.emberMat = new THREE.MeshStandardMaterial({ color: 0x1a0c08, emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 0.5, roughness: 0.9 });
    const rng = () => Math.random();
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035 + rng() * 0.03, 0), this.emberMat);
      c.position.set((rng() - 0.5) * 0.5, 0.02, (rng() - 0.5) * 0.5);
      c.rotation.set(rng() * 3, rng() * 3, 0);
      coals.add(c);
    }
    coals.position.copy(this.house.irori);
    this.scene.add(coals);
    this.emberLight = new THREE.PointLight(0xff6a22, 0.5, 3.5, 2);
    this.emberLight.position.copy(this.house.irori).add(this.tmp.set(0, 0.25, 0));
    this.emberLight.castShadow = false;
    this.scene.add(this.emberLight);

    // --- 로쿠로쿠비: 정면 장지문 **안쪽**에 붙은 검은 실루엣. 종이의 반투명이 실루엣을 만든다 ---
    const tex = makeSilhouetteTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, color: 0x05050a, depthWrite: false });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.3), mat);
    body.position.y = -0.5;
    const neck = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 1.0), mat.clone());
    (neck.material as THREE.MeshBasicMaterial).map = makeNeckTexture();
    neck.position.y = 0.12; // 어깨 위 — scale.y 로 늘어난다
    neck.geometry.translate(0, 0.5, 0); // 아래 기준 스케일
    const head = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), mat.clone());
    (head.material as THREE.MeshBasicMaterial).map = makeHeadTexture();
    head.position.y = 0.7;
    g.add(body, neck, head);
    // 장지문 안쪽 0.12 m, 문 정면을 등지고
    g.position.copy(this.house.frontShoji).addScaledVector(this.house.frontNormal, -0.12);
    g.position.y = this.house.frontShoji.y - 0.35;
    g.lookAt(g.position.clone().add(this.house.frontNormal));
    g.visible = false;
    this.scene.add(g);
    this.rokuro = g;
    this.rokuroNeck = neck;
    this.rokuroHead = head;
    // 백라이트: 실루엣 뒤(집 안) 등불 — 켜지면 장지문이 밝아지며 그림자가 뜬다
    this.rokuroLight = new THREE.PointLight(0xffb060, 0.001, 6, 2);
    this.rokuroLight.position.copy(this.house.frontShoji).addScaledVector(this.house.frontNormal, -1.6);
    this.rokuroLight.castShadow = false;
    this.scene.add(this.rokuroLight);
  }
  private rokuroHead: THREE.Mesh | null = null;

  /**
   * @param playerPos   플레이어 위치
   * @param camera      시야 판정용
   * @param threat      0..1 위협 근접도 (초칭오바케 트리거)
   */
  update(dt: number, playerPos: THREE.Vector3, camera: THREE.Camera, threat: number) {
    this.updateJizo(dt, camera);
    this.updateNoppera(dt, playerPos, camera);
    this.updateEye(dt, threat);
    this.updateDrum(dt, playerPos);
    this.updateEmbers(dt, playerPos);
    this.updateRokuro(dt, playerPos);
  }

  // ---- 야구라 북: 아무도 없는 망루에서 북이 저절로 울린다 — 소음 이벤트라 요괴가 광장으로 모인다 ----
  private updateDrum(dt: number, playerPos: THREE.Vector3) {
    this.drumT -= dt;
    if (this.drumT > 0) return;
    const dist = this.square.drumPos.distanceTo(playerPos);
    if (dist > 55) { this.drumT = 10; return; } // 너무 멀면 미룸
    this.drumT = 50 + Math.random() * 45;
    const ctx = this.sfx.context, master = this.sfx.masterGain;
    if (ctx && master && ctx.state === 'running') {
      if (!this.drumPanner) {
        this.drumPanner = ctx.createPanner();
        this.drumPanner.panningModel = 'HRTF';
        this.drumPanner.distanceModel = 'exponential';
        this.drumPanner.refDistance = 6;
        this.drumPanner.rolloffFactor = 1.1;
        this.drumPanner.connect(master);
      }
      const p = this.drumPanner;
      p.positionX.value = this.square.drumPos.x; p.positionY.value = this.square.drumPos.y; p.positionZ.value = this.square.drumPos.z;
      const beats = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < beats; i++) {
        const t = ctx.currentTime + i * (0.55 + Math.random() * 0.1);
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(64, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1.1, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(e).connect(p); o.start(t); o.stop(t + 0.75);
      }
    }
    // 요괴가 듣는 소음 — 플레이어 발소리보다 크고 멀리 (광장으로 유인되는 위험/기회)
    this.senses?.emitNoise(this.square.drumPos, 30, 1.4);
  }

  // ---- 이로리 불씨: 평소엔 약하게 숨쉬고, 처음 다가가면 확 살아난다 ----
  private updateEmbers(dt: number, playerPos: THREE.Vector3) {
    if (!this.emberLight || !this.emberMat) return;
    this.emberT += dt;
    const dist = this.house.irori.distanceTo(playerPos);
    if (!this.emberFlared && dist < 2.6) {
      this.emberFlared = true;
      this.emberFlare = 2.2;
      // 타닥 — 불씨 튀는 소리 (컨텍스트 직접, sfx.ts 는 사운드 세션 영역)
      const ctx = this.sfx.context, master = this.sfx.masterGain;
      if (ctx && master && ctx.state === 'running') {
        for (let i = 0; i < 6; i++) {
          const t = ctx.currentTime + Math.random() * 0.9;
          const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2400 + Math.random() * 2200;
          const e = ctx.createGain();
          e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.12, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
          o.connect(e).connect(master); o.start(t); o.stop(t + 0.05);
        }
      }
    }
    if (this.emberFlare > 0) this.emberFlare -= dt;
    const breathe = 0.5 + 0.5 * Math.sin(this.emberT * 1.1) * Math.sin(this.emberT * 2.7);
    const flare = Math.max(0, this.emberFlare / 2.2);
    this.emberLight.intensity = 0.35 + breathe * 0.3 + flare * 2.2;
    this.emberMat.emissiveIntensity = 0.35 + breathe * 0.3 + flare * 1.8;
  }

  // ---- 로쿠로쿠비: 장지문 뒤 실루엣의 목이 천장으로 늘어난다. 1회성 ----
  private updateRokuro(dt: number, playerPos: THREE.Vector3) {
    if (!this.rokuro || !this.rokuroNeck || this.rokuroState === 'done') return;
    if (this.rokuroState === 'waiting') {
      // 집 밖 + 정면 8 m 이내 + 실내가 아닐 때
      this.tmp.copy(playerPos).sub(this.house.frontShoji);
      const outside = this.tmp.dot(this.house.frontNormal) > 0.5;
      if (outside && this.tmp.length() < 8 && !this.house.contains(playerPos)) {
        this.rokuroState = 'playing';
        this.rokuroT = 0;
        this.rokuro.visible = true;
        // 낮은 삐걱 — 목이 늘어나는 소리
        const ctx = this.sfx.context, master = this.sfx.masterGain;
        if (ctx && master && ctx.state === 'running') {
          const t0 = ctx.currentTime;
          const o = ctx.createOscillator(); o.type = 'sawtooth';
          o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(420, t0 + 3.2);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 9;
          const e = ctx.createGain();
          e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.16, t0 + 0.6);
          e.gain.setValueAtTime(0.16, t0 + 2.8); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
          o.connect(bp).connect(e).connect(master); o.start(t0); o.stop(t0 + 3.7);
        }
      }
      return;
    }
    // playing: 1 s 페이드인 → 3 s 목 늘어남(머리가 따라 올라감) → 0.6 s 뒤 소멸
    this.rokuroT += dt;
    const t = this.rokuroT;
    const fade = THREE.MathUtils.smoothstep(t, 0, 1) * (t > 4.4 ? Math.max(0, 1 - (t - 4.4) / 0.5) : 1);
    for (const c of this.rokuro.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = fade * 0.92;
    }
    const stretch = 1 + THREE.MathUtils.smoothstep(t, 1.0, 4.0) * 0.95; // 목 1 → 1.95배 (머리가 장지문 안에 머문다)
    this.rokuroNeck.scale.y = stretch;
    if (this.rokuroHead) this.rokuroHead.position.y = 0.7 + (stretch - 1) * 0.98;
    if (this.rokuroLight) this.rokuroLight.intensity = Math.max(0.001, fade * 2.6); // 안쪽 등불이 함께 살아난다
    if (t > 5.0) {
      this.rokuro.visible = false;
      if (this.rokuroLight) this.rokuroLight.intensity = 0.001; // 불이 뚝 꺼진다 (0 은 재컴파일 함정)
      this.rokuroState = 'done';
    }
  }

  // ---- 1) 움직이는 지장 ----
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private updateJizo(dt: number, camera: THREE.Camera) {
    this.jizoT -= dt;
    if (this.jizoT > 0 || this.landmarks.jizo.length === 0) return;
    this.jizoT = 6 + Math.random() * 10;
    // 지장 중 하나라도 화면 안이면 건드리지 않는다 — 보고 있을 땐 움직이지 않는다
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    for (const j of this.landmarks.jizo) {
      this.tmp.copy(j.base); this.tmp.y += 0.6;
      if (this.frustum.containsPoint(this.tmp)) return;
    }
    // 무작위 한 구: 30° 안팎 회전 또는 반 걸음 이동. 이따금 원위치 복구
    const j = this.landmarks.jizo[Math.floor(Math.random() * this.landmarks.jizo.length)]!;
    const r = Math.random();
    if (r < 0.45) j.obj.rotation.y = j.yaw + (Math.random() - 0.5) * 1.1;
    else if (r < 0.8) { j.obj.position.x = j.base.x + (Math.random() - 0.5) * 0.6; j.obj.position.z = j.base.z + (Math.random() - 0.5) * 0.6; }
    else { j.obj.rotation.y = j.yaw; j.obj.position.set(j.base.x, j.base.y - 0.02, j.base.z); }
  }

  // ---- 2) 놋페라보 ----
  private updateNoppera(dt: number, playerPos: THREE.Vector3, camera: THREE.Camera) {
    if (!this.noppera || this.nopperaState === 'gone') return;
    const d = this.noppera.position.distanceTo(playerPos);
    if (this.nopperaState === 'waiting') {
      if (d < 3.5) {
        this.nopperaState = 'turning';
        this.nopperaT = 0;
        this.sfx.nopperaTurn();
      }
      return;
    }
    // turning: 0.8 s 에 걸쳐 플레이어 쪽으로 돌아본다 → 0.9 s 정지 → 소멸
    this.nopperaT += dt;
    const target = Math.atan2(playerPos.x - this.noppera.position.x, playerPos.z - this.noppera.position.z);
    const k = THREE.MathUtils.smoothstep(this.nopperaT, 0, 0.8);
    let dy = target - this.nopperaYaw0;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.noppera.rotation.y = this.nopperaYaw0 + dy * k;
    if (this.nopperaT > 1.7) {
      // 플레이어가 잠깐 다른 곳을 볼 때 사라지면 더 무섭지만, 단순화: 페이드 없이 제거 + 소리
      this.noppera.removeFromParent();
      this.nopperaState = 'gone';
      this.sfx.nopperaVanish();
    }
  }

  // ---- 3) 초칭오바케 ----
  private updateEye(dt: number, threat: number) {
    if (!this.eyeMat) return;
    if (this.eyeT > 0) {
      this.eyeT -= dt;
      // 뜨는 순간 확, 감길 때 천천히
      const a = this.eyeT > 0.35 ? 1 : this.eyeT / 0.35;
      this.eyeMat.opacity = a * 0.95;
      if (this.eyeT <= 0) this.eyeMat.opacity = 0;
      return;
    }
    this.eyeCooldown -= dt;
    if (this.eyeCooldown > 0) return;
    // 위협이 높을 때(8 m 이내 ≈ threat > 0.8) 초당 약 8% 확률
    if (threat > 0.8 && Math.random() < dt * 0.08) {
      this.eyeT = 0.5;
      this.eyeCooldown = 40;
      this.sfx.eyeOpen();
    }
  }
}


// --- 로쿠로쿠비 실루엣 텍스처 (캔버스 알파) ---
function silhouetteCanvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000';
  draw(c);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 어깨·상체 (치켜올라간 좁은 어깨) */
function makeSilhouetteTexture() {
  return silhouetteCanvas(128, 160, (c) => {
    c.beginPath();
    c.moveTo(24, 160); c.lineTo(20, 70); c.quadraticCurveTo(28, 34, 56, 30);
    c.lineTo(72, 30); c.quadraticCurveTo(100, 34, 108, 70); c.lineTo(104, 160);
    c.closePath(); c.fill();
  });
}
/** 목 — 세로로 스케일해도 티가 안 나게 상하 균일 */
function makeNeckTexture() {
  return silhouetteCanvas(32, 128, (c) => {
    c.fillRect(8, 0, 16, 128);
  });
}
/** 머리 — 흐트러진 머리채가 아래로 */
function makeHeadTexture() {
  return silhouetteCanvas(96, 128, (c) => {
    c.beginPath(); c.ellipse(48, 44, 30, 36, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 7; i++) {
      const x = 20 + i * 9;
      c.fillRect(x, 60, 4, 30 + Math.sin(i * 2.7) * 14);
    }
  });
}
