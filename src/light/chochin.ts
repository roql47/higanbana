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
  private hipBone: THREE.Object3D | null = null;
  private modelRoot: THREE.Object3D;
  private rootScale = 1;
  private tmpW = new THREE.Vector3();
  private tmpH = new THREE.Vector3();
  private outward = new THREE.Vector3();
  private t = 0;
  private swing = 0;
  private swingV = 0;
  private flickerVal = 1;
  /** 위협 근접도 0..1 — 가까울수록 불꽃이 크게 흔들린다 (main 이 매 프레임 넣어줌) */
  threat = 0;
  private qParent = new THREE.Quaternion();
  private qCur = new THREE.Quaternion();
  private qTarget = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(modelRoot: THREE.Object3D, shadowMapSize = 1024) {
    this.modelRoot = modelRoot;
    modelRoot.traverse((o) => {
      if (/^(L_Hand|mixamorig:LeftHand)$/.test(o.name)) this.handBone = o;
      if (/^(Hip|Hips|mixamorig:Hips)$/.test(o.name)) this.hipBone = o;
    });

    const size = settings.chochin.size;
    const { paper, mat } = makeLantern(size);
    this.paperMat = mat;
    this.body.add(paper);

    this.light = new THREE.PointLight(settings.chochin.color, 1, settings.chochin.rangeHigh, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    // 그림자 여드름 대책 (2026-08-19, "캐릭터가 조각 깨져 보임" 리포트):
    // 광원이 몸에서 10~20 cm 라 큐브 그림자맵 텍셀 밀도가 극단적으로 낮다.
    // near 0.06 은 깊이 정밀도를 낭비해 소매·치마에 밴딩(acne)이 기어다녔다 → near 0.25 + normalBias 0.12.
    // (25 cm 안쪽은 그림자를 못 만들지만 — 손 자체 그림자 손실 — acne 보다 낫다)
    this.light.shadow.bias = -0.002;
    this.light.shadow.normalBias = 0.12;
    this.light.shadow.camera.near = 0.25;
    // 광원은 **종이 몸통 한가운데**. 아래에 두면 등이 안에서 빛나지 않고 밑으로만 샌다 (2026-08-19 수정)
    this.light.position.set(0, 0, 0);
    this.body.add(this.light);

    this.root.add(this.body);
    this.root.name = 'chochin-mount';
    // 손 본에 직접 붙이면 본 로컬 축을 알 수 없어 오프셋이 제멋대로가 된다.
    // 루트(= 캐릭터 공간)에 붙이고, 매 프레임 손 위치를 캐릭터 공간으로 변환해 따라가게 한다.
    modelRoot.add(this.root);
    this.applyOffsets();
    this.setLevel(settings.chochin.level);
  }

  get level() { return settings.chochin.level; }
  /** 감지 배율 — 빛이 곧 위험이다 (H2 senses 가 읽는다) */
  get detectionMul() { return settings.chochin.detectionMul[settings.chochin.level] ?? 1; }
  get lit() { return settings.chochin.level > 0; }

  /** 루트 스케일을 상쇄해 월드에서 settings.chochin.size 미터가 되게 한다 */
  applyOffsets() {
    const ws = new THREE.Vector3(1, 1, 1);
    this.modelRoot.updateWorldMatrix(true, false);
    this.modelRoot.getWorldScale(ws);
    this.rootScale = Math.max(1e-6, ws.x);
    this.root.scale.setScalar(1 / this.rootScale);
  }

  /**
   * 손을 따라가되 위치는 미터 단위로 직접 지정한다.
   * "바깥쪽"은 리그의 로컬 축을 가정하지 않고 **골반→손 방향**에서 구한다 —
   * 손 본에 그냥 붙이면 등불이 배 안에 박히고, 축을 추측하면 리그가 바뀔 때 깨진다.
   */
  private follow() {
    const m2u = 1 / this.rootScale; // m → 루트 로컬 단위
    const g = settings.chochin.gripPos;
    if (this.handBone) {
      this.handBone.getWorldPosition(this.tmpW);
      this.modelRoot.worldToLocal(this.tmpW);
      if (this.hipBone) {
        this.hipBone.getWorldPosition(this.tmpH);
        this.modelRoot.worldToLocal(this.tmpH);
        this.outward.set(this.tmpW.x - this.tmpH.x, 0, this.tmpW.z - this.tmpH.z);
        if (this.outward.lengthSq() > 1e-6) this.outward.normalize();
        else this.outward.set(1, 0, 0);
      } else this.outward.set(1, 0, 0);
    } else {
      this.tmpW.set(-0.34 * m2u, 0.98 * m2u, 0.10 * m2u);
      this.outward.set(1, 0, 0);
    }
    this.root.position.set(
      this.tmpW.x + this.outward.x * g[0] * m2u,
      this.tmpW.y + g[1] * m2u,
      this.tmpW.z + this.outward.z * g[0] * m2u + g[2] * m2u,
    );
  }

  setLevel(n: number) {
    const c = settings.chochin;
    c.level = ((n % 3) + 3) % 3;
    this.light.color.set(c.color);
    this.light.visible = c.level > 0;
    this.light.distance = c.level === 2 ? c.rangeHigh : c.rangeLow;
    this.paperMat.emissiveIntensity = c.level === 0 ? 0.0 : c.level === 1 ? 0.35 : 0.85;
    // opacity 는 건드리지 않는다 — transparent 재질의 불투명도 변화도 렌더 상태를 바꿔
    // 셰이더 변형이 갈릴 수 있다(실측 재컴파일 확인). 꺼짐은 emissive 로만 표현.
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
    this.follow();

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

    // --- 불꽃 흔들림 (요괴가 가까울수록 심하게 — 초칭이 무서워한다) ---
    if (c.level === 0) {
      this.light.intensity = 0.02; // "꺼짐" — 라이트 자체는 유지 (재컴파일 방지)
    } else {
      const th = this.threat;
      const f = c.flicker * (1 + th * 2.6);
      const speed = 1 + th * 0.9; // 근접 시 떨림도 빨라진다
      const n =
        Math.sin(this.t * 11.3 * speed) * 0.35 +
        Math.sin(this.t * 23.7 * speed + 1.3) * 0.22 +
        Math.sin(this.t * 4.1 * speed + 0.7) * 0.43;
      // 가끔 크게 꺼질 듯 흔들림 — 근접할수록 자주·깊게
      const dip = Math.max(0, Math.sin(this.t * (0.9 + th * 1.6) + 2.1) - (0.94 - th * 0.3)) * 6;
      const targetF = 1 + n * f - dip * f;
      this.flickerVal = damp(this.flickerVal, targetF, 24, dt);
      const base = c.level === 2 ? c.intensityHigh : c.intensityLow;
      this.light.intensity = Math.max(0.02, base * this.flickerVal);
      // distance 는 고정 — 바꾸면 셰이더 변형이 갈린다. 약(level 1)은 세기로만 좁힌다
      this.light.distance = c.rangeHigh;
      this.paperMat.emissiveIntensity = (c.level === 1 ? 0.35 : 0.85) * this.flickerVal;
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
