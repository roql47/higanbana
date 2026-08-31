import * as THREE from 'three';
import { settings } from '@/core/settings';
import { damp } from '@/core/math';
import { Props } from '@/world/props';

/**
 * 섀도맵 진단 로그 게이트. **`import.meta.env.DEV` 만으로는 부족하다** —
 * 큐브 섀도맵 null 로 인한 드로우 거부는 드라이버를 타서(ANGLE Metal 은 조용히 넘긴다)
 * 문제가 실제로 보이는 곳이 배포본이다. 거기서 `?debug` 로 켤 수 있어야 현장에서 판정된다.
 */
const SHADOW_DEBUG = import.meta.env.DEV
  || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));

const CHOCHIN_MODEL = '/models/props/chochin.glb';
let chochinTemplate: Promise<THREE.Group> | null = null;

/** Tripo 원본은 한 재질이다. 한 번만 읽고 각 등불은 지오메트리·텍스처를 공유해 복제한다. */
function loadChochinTemplate() {
  chochinTemplate ??= Props.loadNormalized(CHOCHIN_MODEL, 1, 1);
  return chochinTemplate;
}

/**
 * 초칭(提灯) — 오른손에 든 종이등.
 *
 * 이 게임의 유일한 그림자 광원이자, 난이도 다이얼이다.
 *   끔(0) → 거의 안 보이지만 안전 / 약(1) → 발밑만 / 강(2) → 잘 보이지만 멀리서도 들킨다
 * `detectionMul` 이 H2 의 감각 시스템에 그대로 들어간다.
 *
 * 손 본에 그냥 붙이면 애니메이션을 따라 뒤집히므로, 월드 기준으로 수직을 유지하는
 * 진자(pendulum) 보정을 매 프레임 얹는다 — 걸을수록 앞뒤로 흔들린다.
 */
export class Chochin {
  readonly root = new THREE.Group();      // 손 본(R_Hand)을 따라가는 마운트
  readonly body = new THREE.Group();      // 진자 — 월드 기준 수직 유지
  readonly light: THREE.PointLight;
  /** 종이등 시각물만 따로 숨긴다. `body` 를 숨기면 그 안의 PointLight 도 렌더 목록에서 빠진다 */
  private paper: THREE.Group;
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
  /** 점광원 큐브 섀도맵 갱신 시계. 조명은 60Hz, 그림자만 30Hz로 유지한다. */
  private shadowT = 0;
  /** 섀도맵 null 경고는 한 번만 (dev) — 매 프레임 찍으면 콘솔이 죽는다 */
  private shadowWarned = false;
  /** 손에 들고 있는가 — 획득 전(ACT 2~4)에는 false (`setHeld`) */
  private isHeld = true;
  /** 위협 근접도 0..1 — 가까울수록 불꽃이 크게 흔들린다 (main 이 매 프레임 넣어줌) */
  threat = 0;
  private qParent = new THREE.Quaternion();
  private qCur = new THREE.Quaternion();
  private qTarget = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(modelRoot: THREE.Object3D, shadowMapSize = 1024) {
    this.modelRoot = modelRoot;
    modelRoot.traverse((o) => {
      // **오른손**이다. 미오의 통학가방은 왼쪽 허리에 걸려 있어서(스트랩이 오른어깨→왼허리)
      // 왼손에 들면 등불과 가방이 같은 자리에서 겹친다 (사용자 지적, 2026-08-21).
      if (/^(R_Hand|mixamorig:RightHand)$/.test(o.name)) this.handBone = o;
      if (/^(Hip|Hips|mixamorig:Hips)$/.test(o.name)) this.hipBone = o;
    });

    const size = settings.chochin.size;
    const { paper, mat } = makeLantern(size);
    this.paper = paper;
    this.paperMat = mat;
    this.body.add(paper);

    this.light = new THREE.PointLight(settings.chochin.color, 1, settings.chochin.rangeHigh, 2);
    // decay 2(물리값)는 광원이 몸에서 30 cm 라 다리·치마가 순백으로 포화돼 텍스처가 사라진다.
    // 최대 단계에서도 길이 안 보이던 문제를 해결하기 위해 1.35 로 완만하게 조정한다.
    // 광량과 함께 중거리 조도를 확보하되 근접부는 과하게 포화되지 않는 범위다.
    // 얼굴 쪽은 이 등불로 해결되지 않는다(골반 높이에서 아래·옆으로 비춘다) → light/faceFill.ts 참고.
    this.light.decay = 1.35;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    // 그림자 여드름 대책 (2026-08-19, "캐릭터가 조각 깨져 보임" 리포트):
    // 광원이 몸에서 10~20 cm 라 큐브 그림자맵 텍셀 밀도가 극단적으로 낮다.
    // near 0.06 은 깊이 정밀도를 낭비해 소매·치마에 밴딩(acne)이 기어다녔다 → near 0.25 + normalBias.
    // (25 cm 안쪽은 그림자를 못 만들지만 — 손 자체 그림자 손실 — acne 보다 낫다)
    //
    // 2026-08-20: normalBias 0.12 는 12 cm 짜리 오프셋이라 턱 밑·소매 안쪽 자기그림자가 통째로
    // 사라졌다. 캐릭터 메시를 재생성해 이목구비가 실제 지오메트리로 들어오면서 그 손실이 눈에 띄어
    // 0.06 으로 낮췄다 — 걷기/정지 포즈에서 acne 재발 없음을 확인.
    this.light.shadow.bias = -0.0015;
    this.light.shadow.normalBias = 0.06;
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
  /**
   * 감지 배율 — 빛이 곧 위험이다 (H2 senses 가 읽는다).
   * **미소지면 「끔」 값으로 고정**한다. 안 들고 있는 등불이 플레이어를 들키게 하면 안 된다
   */
  get detectionMul() {
    const d = settings.chochin.detectionMul;
    return this.isHeld ? (d[settings.chochin.level] ?? 1) : (d[0] ?? 1);
  }
  get lit() { return this.isHeld && settings.chochin.level > 0; }

  /**
   * 들고 있는가 (각색 6 C안 / P1-2).
   *
   * 미오는 **빈손으로 버스에서 내린다.** 초칭은 마을 초입 처마에서 얻는다
   * (`world/higasato/eaveChochin.ts`). 그래서 ACT 2~4 동안은 이 값이 false 다.
   *
   * 시스템을 끄지 않고 **가시성과 감지 배율만** 막는다 — 초칭 코드(진자·불꽃·그림자·
   * 셰이더 프리워밍)는 전부 그대로 살아 있고, 획득 순간 `setHeld(true)` 한 줄로 돌아온다.
   */
  get held() { return this.isHeld; }
  setHeld(v: boolean) {
    if (this.isHeld === v) return;
    this.isHeld = v;
    // root/body 안에는 PointLight 가 있다. 조상 그룹을 숨겨도 three 는 라이트 수를 줄여
    // NUM_POINT_LIGHTS 셰이더를 다시 컴파일한다. 시각물만 숨기고 라이트는 세기 0으로 상주시킨다.
    this.root.visible = true;
    this.body.visible = true;
    this.paper.visible = v;
    this.light.visible = true;
    if (!v) this.light.intensity = 0;
    this.syncShadowWork();
  }

  /**
   * 점광원 그림자는 한 번 갱신할 때 씬을 여섯 방향으로 다시 그린다.
   * `castShadow` 자체를 토글하면 NUM_POINT_LIGHT_SHADOWS 셰이더 변형이 바뀌어 획득/점등 순간
   * 전체 재질이 다시 컴파일될 수 있으므로 그대로 둔다. 대신 불이 실제로 켜져 있을 때만
   * 큐브 섀도맵을 갱신한다. 다시 켜는 첫 프레임은 반드시 새로 굽는다.
   */
  private syncShadowWork() {
    const lit = this.isHeld && settings.chochin.level > 0;
    // 켜진 동안도 renderer의 매 프레임 자동 갱신에 맡기지 않는다. update()가 30Hz로 요청한다.
    this.light.shadow.autoUpdate = false;
    // ⚠️ `lit` 만으로 잠그면 안 된다. three 의 `WebGLShadowMap.render()` 는
    // `autoUpdate === false && needsUpdate === false` 스킵을 **맵 할당보다 먼저** 하므로,
    // 한 번도 안 구운 상태에서 꺼지면 `shadow.map` 이 영영 null 로 남는다. 그런데 `castShadow` 는
    // (재컴파일 방지를 위해) 계속 true라 셰이더에는 `samplerCubeShadow` 가 남아 있고, three 는
    // 큐브 shadow 용 빈 텍스처 폴백이 없어 비교모드 없는 `emptyCubeTexture` 를 물린다
    // → ANGLE 이 그 프로그램의 **모든 드로우콜을 거부**한다
    // (`GL_INVALID_OPERATION: Mismatch between texture format and sampler type`).
    // 표준 재질만 통째로 사라지는 증상이 이것이다. 맵이 없으면 꺼져 있어도 한 번은 굽는다.
    this.light.shadow.needsUpdate = lit || this.light.shadow.map === null;
    this.shadowT = 0;
  }

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
    this.light.visible = true;
    this.light.distance = c.level === 2 ? c.rangeHigh : c.rangeLow;
    this.paperMat.emissiveIntensity = c.level === 0 ? 0.0 : c.level === 1 ? 0.35 : 0.85;
    // opacity 는 건드리지 않는다 — transparent 재질의 불투명도 변화도 렌더 상태를 바꿔
    // 셰이더 변형이 갈릴 수 있다(실측 재컴파일 확인). 꺼짐은 emissive 로만 표현.
    this.syncShadowWork();
  }

  cycle() { this.setLevel(settings.chochin.level + 1); }

  setShadowMapSize(size: number) {
    if (this.light.shadow.mapSize.width === size) return;
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.light.shadow.mapSize.set(size, size);
    // 버린 맵은 **반드시** 다시 굽는다 — 등불 미소지(ACT 2~4)나 「끔」 상태에서 품질을 바꾸면
    // `syncShadowWork()` 가 다시 불릴 일이 없어 null 인 채로 남는다 (위 주석의 그 상태다).
    this.light.shadow.needsUpdate = true;
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

    // PointLight의 공간적 결과는 그대로 두고 시간 해상도만 30Hz로 제한한다.
    // 60fps 기준 한 프레임 지연이라 눈에 띄지 않지만, 여섯 방향 depth 렌더는 절반으로 줄어든다.
    if (this.lit) {
      this.shadowT -= dt;
      if (this.shadowT <= 0) {
        this.shadowT = 1 / 30;
        this.light.shadow.needsUpdate = true;
      }
    } else if (this.light.shadow.map === null) {
      // 자가 치유 그물 — 어떤 경로로 맵이 null 이 되든 다음 섀도 패스에서 되살린다.
      // 프레임당 분기 하나가 「씬 전체 드로우 거부」보다 싸다.
      this.light.shadow.needsUpdate = true;
      if (SHADOW_DEBUG && !this.shadowWarned) {
        this.shadowWarned = true;
        console.warn('[chochin] 큐브 섀도맵이 null 이었다 — 다시 굽는다 (samplerCubeShadow mismatch 방지). '
          + `held=${this.isHeld} level=${settings.chochin.level} mapSize=${this.light.shadow.mapSize.width}`);
      }
    }

    // --- 불꽃 흔들림 (요괴가 가까울수록 심하게 — 초칭이 무서워한다) ---
    if (!this.isHeld) {
      this.light.intensity = 0;
      this.paperMat.emissiveIntensity = 0;
    } else if (c.level === 0) {
      // 강도 0이어도 라이트 객체는 visible 상태라 셰이더 광원 수는 그대로다.
      // `syncShadowWork()`가 큐브 섀도맵 갱신도 멈추므로 꺼진 등불의 GPU 비용은 거의 0이다.
      this.light.intensity = 0;
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
/**
 * 종이등 한 채. **획득 전 처마에 걸려 있는 것도 같은 함수로 만든다**
 * (`world/higasato/eaveChochin.ts`) — 떼기 전과 든 뒤가 다른 물건이면 획득이 교환이 된다.
 */
export function makeLantern(
  size: number,
  material?: THREE.MeshStandardMaterial,
  linkedMaterials: THREE.MeshStandardMaterial[] = [],
) {
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
  const paperMat = material ?? new THREE.MeshStandardMaterial({
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

  // 절차 메시를 즉시 보여 주고, Tripo GLB가 도착하면 같은 그룹 안에서 교체한다.
  // 호출부는 그룹·재질 참조를 계속 유지하므로 밝기 전환·진자·획득 로직을 바꿀 필요가 없다.
  void loadChochinTemplate().then((tpl) => {
    const model = tpl.clone(true);
    let source: THREE.MeshStandardMaterial | null = null;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      source ??= src;
      mesh.material = paperMat;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    if (!source) return;
    for (const target of [paperMat, ...linkedMaterials]) copyLanternSurface(source, target);
    model.scale.setScalar(size);
    model.position.y = -size / 2; // Props 정규화 원점은 바닥 — 등불 진자 원점은 몸통 중앙
    g.clear();
    g.add(model);
  }).catch((e) => console.warn('[chochin] Tripo 모델 로드 실패 — 절차 모델 유지:', e));

  return { paper: g, mat: paperMat };
}

/** 텍스처/PBR은 Tripo에서, 발광색·오염 변주는 게임 재질에서 가져온다. */
function copyLanternSurface(source: THREE.MeshStandardMaterial, target: THREE.MeshStandardMaterial) {
  const color = target.color.clone();
  const emissive = target.emissive.clone();
  const emissiveIntensity = target.emissiveIntensity;
  const opacity = target.opacity;
  const transparent = target.transparent;
  target.copy(source);
  target.color.copy(color);
  target.emissive.copy(emissive);
  // 종이의 밝은 부분만 안에서 빛나고 검은 손잡이는 검게 남는다.
  target.emissiveMap = source.map;
  target.emissiveIntensity = emissiveIntensity;
  target.opacity = opacity;
  target.transparent = transparent;
  target.side = THREE.DoubleSide;
  target.needsUpdate = true;
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
