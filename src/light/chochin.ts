import * as THREE from 'three';
import { settings } from '@/core/settings';
import { damp } from '@/core/math';

/**
 * 초칭(提灯) — 왼손에 든 종이등.
 *
 * 이 게임의 유일한 그림자 광원이자, 난이도 다이얼이다.
 *   끔(0) → 거의 안 보이지만 안전 / 약(1) → 발밑만 / 강(2) → 잘 보이지만 멀리서도 들킨다
 * `detectionMul` 이 H2 의 감각 시스템에 그대로 들어간다.
 *
 * 손 본에 그냥 붙이면 애니메이션을 따라 뒤집히므로, 월드 기준으로 수직을 유지하는
 * 진자(pendulum) 보정을 매 프레임 얹는다 — 걸을수록 앞뒤로 흔들린다.
 */
export class Chochin {
  readonly root = new THREE.Group();      // L_Hand 본에 붙는 마운트
  readonly body = new THREE.Group();      // 진자 — 월드 기준 수직 유지
  readonly light: THREE.PointLight;
  private paperMat: THREE.MeshStandardMaterial;
  private handBone: THREE.Object3D | null = null;
  private t = 0;
  private swing = 0;
  private swingV = 0;
  private flickerVal = 1;
  private qParent = new THREE.Quaternion();
  private qCur = new THREE.Quaternion();
  private qTarget = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(modelRoot: THREE.Object3D, shadowMapSize = 1024) {
    modelRoot.traverse((o) => {
      if (/^(L_Hand|mixamorig:LeftHand)$/.test(o.name)) this.handBone = o;
    });

    const size = settings.chochin.size;
    const { paper, mat } = makeLantern(size);
    this.paperMat = mat;
    this.body.add(paper);

    this.light = new THREE.PointLight(settings.chochin.color, 1, settings.chochin.rangeHigh, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.light.shadow.bias = -0.004;
    this.light.shadow.normalBias = 0.035;
    this.light.shadow.camera.near = 0.06;
    this.light.position.set(0, -size * 0.45, 0);
    this.body.add(this.light);

    this.root.add(this.body);
    this.root.name = 'chochin-mount';
    if (this.handBone) this.handBone.add(this.root);
    else modelRoot.add(this.root); // 본을 못 찾으면 루트에 매달아 최소한 불은 켜지게
    this.applyOffsets();
    this.setLevel(settings.chochin.level);
  }

  get level() { return settings.chochin.level; }
  /** 감지 배율 — 빛이 곧 위험이다 (H2 senses 가 읽는다) */
  get detectionMul() { return settings.chochin.detectionMul[settings.chochin.level] ?? 1; }
  get lit() { return settings.chochin.level > 0; }

  /** 본 스케일을 상쇄해 월드에서 settings.chochin.size 미터가 되게 한다 */
  applyOffsets() {
    const g = settings.chochin.gripPos;
    const ws = new THREE.Vector3(1, 1, 1);
    if (this.handBone) {
      this.handBone.updateWorldMatrix(true, false);
      this.handBone.getWorldScale(ws);
    }
    const k = 1 / Math.max(1e-6, ws.x);
    this.root.position.set(g[0] * k, g[1] * k, g[2] * k);
    this.root.scale.setScalar(k);
  }

  setLevel(n: number) {
    const c = settings.chochin;
    c.level = ((n % 3) + 3) % 3;
    this.light.color.set(c.color);
    this.light.visible = c.level > 0;
    this.light.distance = c.level === 2 ? c.rangeHigh : c.rangeLow;
    this.paperMat.emissiveIntensity = c.level === 0 ? 0.0 : c.level === 1 ? 0.5 : 1.6;
    this.paperMat.opacity = c.level === 0 ? 0.85 : 0.98;
  }

  cycle() { this.setLevel(settings.chochin.level + 1); }

  setShadowMapSize(size: number) {
    if (this.light.shadow.mapSize.width === size) return;
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.light.shadow.mapSize.set(size, size);
  }

  /**
   * @param yaw   캐릭터가 바라보는 방향 (rad)
   * @param speed 수평 속도 (m/s) — 빠를수록 크게 흔들린다
   */
  update(dt: number, yaw: number, speed: number) {
    this.t += dt;
    const c = settings.chochin;

    // --- 진자: 목표 각도로 스프링, 걸음에 맞춰 앞뒤로 ---
    const drive = Math.sin(this.t * (3.2 + speed * 0.8)) * (0.05 + speed * 0.035);
    const target = drive;
    const k = 42, damping = 7.5;
    this.swingV += (target - this.swing) * k * dt - this.swingV * damping * dt;
    this.swing += this.swingV * dt;

    this.euler.set(this.swing, yaw, Math.sin(this.t * 1.7) * 0.03 * (0.4 + speed * 0.2), 'YXZ');
    this.qTarget.setFromEuler(this.euler);
    this.qCur.slerp(this.qTarget, 1 - Math.exp(-c.swayLag * dt));

    this.body.parent!.getWorldQuaternion(this.qParent);
    this.body.quaternion.copy(this.qParent).invert().multiply(this.qCur);

    // --- 불꽃 흔들림 ---
    if (c.level > 0) {
      const f = c.flicker;
      const n =
        Math.sin(this.t * 11.3) * 0.35 +
        Math.sin(this.t * 23.7 + 1.3) * 0.22 +
        Math.sin(this.t * 4.1 + 0.7) * 0.43;
      const dip = Math.max(0, Math.sin(this.t * 0.9 + 2.1) - 0.94) * 6; // 가끔 크게 흔들림
      const targetF = 1 + n * f - dip * f;
      this.flickerVal = damp(this.flickerVal, targetF, 24, dt);
      const base = c.level === 2 ? c.intensityHigh : c.intensityLow;
      this.light.intensity = Math.max(0, base * this.flickerVal);
      this.light.distance = (c.level === 2 ? c.rangeHigh : c.rangeLow) * (0.94 + 0.06 * this.flickerVal);
      this.paperMat.emissiveIntensity = (c.level === 1 ? 0.5 : 1.6) * this.flickerVal;
    }
  }
}

/** 종이등 메시: 배가 부른 원통(Lathe) + 위아래 나무 테 + 손잡이 고리 */
function makeLantern(size: number) {
  const g = new THREE.Group();
  const bodyH = size * 0.72, rMax = size * 0.30;

  // --- 종이 몸통 ---
  const profile: THREE.Vector2[] = [];
  const SEG = 14;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const y = -bodyH / 2 + bodyH * t;
    const r = rMax * (0.42 + 0.58 * Math.sin(Math.PI * t) ** 0.65);
    profile.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  const paperGeo = new THREE.LatheGeometry(profile, 18);
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xf6e2bd,
    emissive: new THREE.Color(0xffa348),
    emissiveIntensity: 1.6,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.98,
    map: makePaperTexture(),
  });
  const paper = new THREE.Mesh(paperGeo, paperMat);
  paper.castShadow = false;   // 자기 그림자로 광원을 가리면 안 된다
  paper.receiveShadow = false;
  g.add(paper);

  // --- 위·아래 나무 테 ---
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.85, metalness: 0 });
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(rMax * 0.46, rMax * 0.46, size * 0.045, 14), woodMat);
    ring.position.y = s * (bodyH / 2 + size * 0.02);
    g.add(ring);
  }
  // --- 손잡이 고리 ---
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(size * 0.13, size * 0.014, 6, 16, Math.PI), woodMat);
  hoop.position.y = bodyH / 2 + size * 0.05;
  hoop.rotation.y = Math.PI / 2;
  g.add(hoop);

  return { paper: g, mat: paperMat };
}

/** 종이등 표면: 가로 살(骨) + 위아래 붉은 띠 */
function makePaperTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7e6c6';
  ctx.fillRect(0, 0, 64, 128);
  // 가로 살
  ctx.strokeStyle = 'rgba(120, 92, 60, 0.5)';
  ctx.lineWidth = 1.4;
  for (let y = 5; y < 128; y += 7) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke();
  }
  // 위아래 붉은 띠
  ctx.fillStyle = '#b3372a';
  ctx.fillRect(0, 0, 64, 12);
  ctx.fillRect(0, 116, 64, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
