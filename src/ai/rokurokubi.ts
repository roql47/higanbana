import * as THREE from 'three';
import { Props } from '@/world/props';
import { damp, dampAngle } from '@/core/math';
import type { Sfx } from '@/audio/sfx';

/**
 * 로쿠로쿠비 — 사당의 첫 보스 (ACT 6~7, PLAN-STORY §5.3.1)
 *
 * **몸통은 사당 안을 활주하고, 목은 몸과 독립해 사냥한다.** 32마디 목 본 체인을 매 프레임 코드가 몬다.
 * 공식은 Blender 프리뷰에서 실측으로 확정한 것을 그대로 이식했다
 * (`scripts/blender/anim-rokurokubi-preview.py` · `anim-rokurokubi-glide.py` — 그쪽이 원본이다):
 *
 *   · **한 축 굽힘** — 굽힘 평면 법선(up × 타깃방향) 사원수 하나. 오일러 pitch+yaw 합성은
 *     평면이 돌아가 반대로 휜다(실측). 이 축은 체인이 굽는 동안 마디 로컬에서 불변이다
 *   · **가운데 볼록 분배** — 전방 편중은 위 절반이 막대기가 된다(사용자 리포트 2회)
 *   · **코브라 훅** — 위 1/3 이 감아 넘어와 머리가 걸린다. 얼굴은 lookAt 이 되세우므로
 *     「목이 넘어와 머리가 나를 본다」가 된다
 *   · **뱀 파도 봉투** — 위상차 사인(총 6.6 rad), 진폭은 끝으로 갈수록 ×2.2
 *   · **늘이기** — 마디 +Y 이동(스케일 아님 — 텍스처가 균등하게 늘어난다), 뿌리 4마디 고정 램프
 *   · **고개 갸웃** — lookAt 은 시선 축의 방향만 잡는다. 그 축 주변 롤은 자유라서,
 *     롤을 넣으면 얼굴은 나를 본 채 고개만 기울어진다
 *   · **스트라이크 3단** — 코일 → 런지 → 정착. 길이·굽힘은 전 구간 감쇠 보간해 튕김 없이 이어진다
 *
 * ## 2026-08-25 — 「얼굴이 360도 돌아가고 갑자기 확 튄다」 (사용자 리포트)
 * 원인 둘 다 **누적**이었다.
 *   ① 머리 자세를 지난 프레임의 월드 자세에 얹어 갱신했는데, `setFromUnitVectors` 는 최소
 *      회전이라 시선축 둘레 롤을 지우지 않는다 → 갸웃(최대 0.24 rad)이 프레임마다 적분돼
 *      초당 수 라디안으로 얼굴이 감겼다. 이제 목 끝의 **rest 에서 목표를 새로 짓는다**
 *   ② `UP × Dn` 이 0 이 되는 순간(타깃이 목 바로 위·아래) 굽힘면을 (1,0,0) 으로 리셋해
 *      평면이 한 프레임에 통째로 돌았다 → 직전 축을 들고 특이점을 통과한다
 * 함께: 얼굴 스윙을 105° 로 잘라(180° 특이점 소멸) 나머지는 목이 감아 오게 하고,
 * 파도 진폭·각속도를 전 구간 ×0.7, 파장을 6.6 → 8.4 rad 로 늘렸다(굼실거림).
 * **사거리·타이밍(reach/hook/stateT)과 잡기 판정은 건드리지 않았다.**
 *
 * ## 상태기계
 * dormant(숨음) → [activate: 방울 픽업] watch(0.65 s 응시) → hunt(목을 뻗어 추적)
 *   → coil → lunge → settle → hunt … / 플레이어가 멀어지면 retract → watch
 * 잡으면(onCatch) — §5.3.1: 방울을 빼앗고 사당 밖으로 던진다(사망 없음, 첫 보스는 관대하게).
 * 그 처리는 main 이 한다 — 드라이버는 「머리끝이 닿았다」까지만 안다.
 */

export type RokuroState = 'dormant' | 'watch' | 'hunt' | 'coil' | 'lunge' | 'settle' | 'retract';

export interface RokuroOpts {
  url: string;
  /** 몸 높이(m) — 모델(0.98 m)을 이 키로 스케일 */
  height: number;
  /** 발 위치(월드) */
  pos: THREE.Vector3;
  /** 정면 방향 yaw (모델 정면 = +Z) */
  yaw: number;
  /** 몸통이 활주할 수 있는 사당 실내와 탈출선 */
  arena?: {
    minX: number; maxX: number; minZ: number; maxZ: number;
    floorY: number;
    escapeX: number;
    blockers: { x: number; z: number; radius: number; blocksNeck?: boolean }[];
  };
}

export interface RokuroPlayerMotion {
  speed: number;
  crouching: boolean;
  /** 이동 입력을 누르는 중. 위치 변화와 함께 실제 도주 의도를 판정한다. */
  moving?: boolean;
  /** 방울이 울리는 중 (방울 소지 + 달리기) — 활주 속도 연출을 높인다. */
  ringing?: boolean;
}

const NECK_N = 32;
const L0 = 0.17 / NECK_N;      // 마디 rest 길이 (모델 단위)
const HEAD_L = 0.18;
const BASE_Y = 0.63;           // 목 밑동 높이 (모델 단위)
/**
 * 마디당 늘이기 한계 — 프리뷰(×4)보다 후한 ×10. 실측: ×5 로는 목 최대 1.2 m 라
 * 스트라이크 사거리(2.1 m)에 못 미쳐 잡기가 영영 안 걸렸다. ×10 = 목 최대 ≈ 2.2 m.
 * 32마디 + 텐트 웨이트라 버티고, 늘수록 가늘어지는 것이 로쿠로쿠비의 정통이다
 */
const SEG_MAX = L0 * 10.0;
/** 도주 대응 공격에서만 목 마디를 더 풀어 준다. 평소에는 몸통으로 끝까지 압박한다. */
const SEG_MAX_RANGED = L0 * 15.0;
const NECK_NEAR_RANGE = 3.15;
/** 미오와 몸이 실제로 맞닿아 보이는 중심 간격. 기존 2.8~5m 정지선을 제거한다. */
const BODY_CONTACT_RANGE = 0.72;
/** 플레이어가 로쿠로쿠비 반대 방향으로 계속 움직일 때만 간헐적 목 공격을 허용한다. */
const RETREAT_ARM_TIME = 1.15;
const RETREAT_STRIKE_MIN = 2.0;
const RETREAT_STRIKE_MAX = 5.3;
/** 원형 장애물 근사가 제단 모서리보다 부풀어 생기는 목 끝점의 최대 허용 침투. */
const NECK_TARGET_GRACE = 0.45;

// 분배 테이블 — 프리뷰와 동일식 (마디 수 파라메트릭)
const BW = Array.from({ length: NECK_N }, (_, i) => 0.25 + Math.sin(Math.PI * (i + 0.5) / NECK_N));
const BWs = BW.reduce((a, b) => a + b, 0);
const HOOK_W = Array.from({ length: NECK_N }, (_, i) => Math.max(0, Math.sin(Math.PI * (i - NECK_N * 0.62) / (NECK_N * 0.38))));
const HOOK_Ws = HOOK_W.reduce((a, b) => a + b, 0);
/**
 * 파도 봉투 — 사용자 리포트(2026-08-25 「너무 다이나믹하다」)로 완만하게 다시 잡았다.
 * 끝 진폭 2.2 → 1.6, 지수 1.5 → 1.9. 지수를 올리면 중간이 잠잠해지고 끝에서만 살아난다 —
 * 뱀은 몸통 전체가 같은 세기로 떠는 게 아니라 파도가 끝으로 갈수록 커진다.
 */
const WENV = Array.from({ length: NECK_N }, (_, i) => 0.35 + 1.25 * (i / (NECK_N - 1)) ** 1.9);
const RAMP = Array.from({ length: NECK_N }, (_, i) => Math.min(1, Math.max(0, (i - 4) / 8)));
const RAMPs = RAMP.reduce((a, b) => a + b, 0);
/** 목을 타고 내려가는 파장 — 총 위상 6.6 → 8.4 rad(≈1.3 파장). 길수록 굼실거린다 */
const PHI = 8.4 / NECK_N;

/** 얼굴이 목보다 더 돌아갈 수 있는 한계. 이걸 넘기면 뱀도 사람도 아니다 */
const HEAD_MAX_SWING = THREE.MathUtils.degToRad(105);

const UP = new THREE.Vector3(0, 1, 0);

export class RokuroKubi {
  readonly root = new THREE.Group();
  state: RokuroState = 'dormant';
  /** 머리끝이 플레이어에 닿았다 — 강탈·방출은 main 이 */
  onCatch: (() => void) | null = null;
  /** 동쪽 툇마루 밖까지 방울을 가지고 빠져나갔다 */
  onEscape: (() => void) | null = null;

  private model: THREE.Object3D | null = null;
  private neck: THREE.Bone[] = [];
  private head: THREE.Bone | null = null;
  private armL: THREE.Bone | null = null;
  private armR: THREE.Bone | null = null;
  /** 목 체인에서 분리한 좌우 머리카락 — Head 자식이지만 독립 관성으로 움직인다 */
  private hairL: THREE.Bone | null = null;
  private hairR: THREE.Bone | null = null;
  private bodyRoot: THREE.Bone | null = null;
  private spine: THREE.Bone | null = null;
  private chest: THREE.Bone | null = null;
  private restQ = new Map<THREE.Bone, THREE.Quaternion>();
  private restP = new Map<THREE.Bone, THREE.Vector3>();
  /** 체인 rest 의 모델→본로컬 회전 (직선 체인이라 전 마디 공통) */
  private chainRestInv = new THREE.Quaternion();
  /** Head 본 로컬에서의 얼굴(+Z)·시선 보정 축 */
  private faceLocal = new THREE.Vector3(0, 0, 1);

  private t = 0;
  private stateT = 0;
  /** 부드럽게 따라가는 현재값들 (툭 바뀌면 스위치지 생물이 아니다) */
  private reach = 0;
  private hookCur = 0;
  private ampCur = 0;
  /** 상태별 파도 속도를 적분한 연속 위상. `전체 시간 × 속도`는 상태 전환마다 위상이 점프한다. */
  private wavePhase = 0;
  private waveSpeedCur = 1.15;
  private caught = false;
  /** 몸통 활주 — 위치와 회전을 루트 Group 에 적용하고, 본에는 기울기만 준다 */
  private home: THREE.Vector3;
  private glideVel = new THREE.Vector3();
  private glideSpeed = 0;
  private heading: number;
  /** 장애물이 정면에 있을 때 선택한 우회 방향. 매 프레임 좌우를 바꾸면 제자리 진동한다. */
  private avoidIndex = -1;
  private avoidSide: -1 | 1 = 1;
  private stuckT = 0;
  /** 여러 기둥·경상이 겹치는 구간을 한 번에 우회하는 사당 전용 소형 A* 경로. */
  private arenaPath: THREE.Vector2[] = [];
  private arenaPathIndex = 0;
  private arenaRepathT = 0;
  private arenaPathTarget = new THREE.Vector2();
  private arenaPathTargetReady = false;
  /** 빠른 머리끝이 프레임 사이를 지나가도 잡도록 이전 위치와 선분 판정을 쓴다 */
  private prevTip = new THREE.Vector3();
  private tipReady = false;
  /** 활성화 뒤에는 플레이어의 실제 위치를 놓치지 않는다. 목은 아래의 감쇠 좌표를 따로 쓴다. */
  private known = new THREE.Vector3();
  /** 지각 좌표가 바뀌어도 목과 얼굴은 이 감쇠 좌표를 향한다. 한 프레임 방향 점프를 막는다. */
  private neckAim = new THREE.Vector3();
  private neckAimReady = false;
  /** 제단 뒤 금줄을 성급히 건드렸는가. 조사 순서가 첫 추격의 시작 여유와 활주 속도를 바꾼다. */
  private threatScale = 1;
  private openingDelay = 1.65;
  /** 다시 묶은 금줄 수. 하나마다 활주와 목 사거리가 조금씩 눌린다. */
  private wardBindings = 0;
  /** 세 매듭을 모두 되묶기 전에는 문밖 좌표를 밟아도 탈출로 판정하지 않는다. */
  private escapeEnabled = true;
  /** 첫 런지만 코일 동작을 길게 보여 준다. 이후 반복 공격은 원래 리듬으로 돌아간다. */
  private firstStrike = true;
  /** 플레이어의 실제 이동 벡터가 몸통 반대 방향으로 이어진 시간과 공격 재사용 대기. */
  private prevPlayer = new THREE.Vector3();
  private prevPlayerReady = false;
  private retreatPressure = 0;
  private retreatCooldown = 0.8;
  private retreatStrikeIndex = 0;
  private rangedAttack = false;
  /** 도주 대응용 목 마디 한계의 블렌드. boolean 전환을 바로 쓰면 공격 종료 때 목이 접힌다. */
  private rangedReachBlend = 0;

  // 목 축은 스크래치 벡터와 분리한다. 같은 벡터를 루프 안에서 재사용하면 2번째 마디부터
  // 굽힘축이 파도축으로 바뀌어 목 상단이 반대로 꺾인다.
  private bendAxis = new THREE.Vector3();
  private waveAxisX = new THREE.Vector3();
  private waveAxisZ = new THREE.Vector3();

  // 스크래치
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpV4 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private tmpQ3 = new THREE.Quaternion();
  private tmpQ4 = new THREE.Quaternion();
  /** 머리의 **월드** 자세 — 감쇠는 여기서만 돈다 (본 로컬에 누적하면 롤이 쌓인다) */
  private headW = new THREE.Quaternion();
  private headTargetW = new THREE.Quaternion();
  private headWReady = false;
  /** 직전 굽힘면 법선 — 타깃이 목 바로 위·아래로 올 때 평면이 튀지 않게 들고 간다 */
  private lastBendW = new THREE.Vector3(1, 0, 0);

  constructor(private opts: RokuroOpts, private sfx: Sfx) {
    this.root.position.copy(opts.pos);
    this.root.rotation.y = opts.yaw;
    this.home = opts.pos.clone();
    this.heading = opts.yaw;
    this.root.visible = false;   // dormant — 방울을 집기 전에는 없다
  }

  async load() {
    const gltf = await Props.loader().loadAsync(this.opts.url);
    const m = gltf.scene;
    const s = this.opts.height / 0.98;
    m.scale.setScalar(s);
    m.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
        return;
      }
      if (/^Neck_\d+$/.test(b.name)) this.neck[Number(b.name.slice(5))] = b;
      else if (b.name === 'Head') this.head = b;
      else if (b.name === 'L_Arm') this.armL = b;
      else if (b.name === 'R_Arm') this.armR = b;
      else if (b.name === 'Hair_L') this.hairL = b;
      else if (b.name === 'Hair_R') this.hairR = b;
      else if (b.name === 'Root') this.bodyRoot = b;
      else if (b.name === 'Spine') this.spine = b;
      else if (b.name === 'Chest') this.chest = b;
      this.restQ.set(b, b.quaternion.clone());
      this.restP.set(b, b.position.clone());
    });
    if (this.neck.length !== NECK_N || !this.head) {
      console.warn('[rokuro] 본이 모자란다', this.neck.length, !!this.head);
    }
    // 체인 rest 월드 회전(모델 공간) — 로드 직후 포즈 = rest
    m.updateWorldMatrix(false, true);
    if (this.neck[0]) {
      this.neck[0].getWorldQuaternion(this.chainRestInv);
      // 모델 루트의 회전(스케일 무시)을 벗겨 모델 공간 기준으로
      this.tmpQ.setFromEuler(new THREE.Euler(0, 0, 0));
      this.chainRestInv.invert();
    }
    if (this.head) {
      this.head.getWorldQuaternion(this.tmpQ2);
      this.faceLocal.set(0, 0, 1).applyQuaternion(this.tmpQ2.clone().invert()).normalize();
    }
    this.model = m;
    this.root.add(m);
  }

  /** ACT 6 조사 결과를 전투 규칙으로 변환한다. */
  configureWardResult(disturbed: boolean) {
    this.threatScale = disturbed ? 1.08 : 0.9;
    // 금줄을 성급히 건드렸어도 ‘나타남→목을 감음→공격’은 한 번 읽을 수 있어야 한다.
    this.openingDelay = disturbed ? 1.25 : 1.85;
  }

  /** 사당 문과 AI의 탈출 판정을 같은 상태로 묶는다. */
  setEscapeEnabled(enabled: boolean) { this.escapeEnabled = enabled; }

  /**
   * 추격 중 금줄 하나가 되묶였다. 목을 즉시 거두고 잠깐 다시 응시하게 해,
   * 상호작용을 마친 플레이어에게 다음 매듭으로 움직일 실제 틈을 준다.
   */
  bindWard(level: number) {
    this.wardBindings = THREE.MathUtils.clamp(Math.floor(level), 0, 3);
    if (this.state === 'dormant') return;
    this.rangedAttack = false;
    this.glideVel.multiplyScalar(0.12);
    this.glideSpeed *= 0.12;
    this.tipReady = false;
    this.caught = false;
    this.setState('retract');
  }

  /**
   * 방울을 집었다 — 정문을 막은 큰 형체가 고개를 돌린다.
   * @param heardAt 첫 등장 때 고개를 돌릴 위치. 다음 갱신부터는 실제 플레이어를 계속 추적한다.
   */
  activate(heardAt?: THREE.Vector3) {
    if (this.state !== 'dormant') return;
    if (heardAt) this.known.copy(heardAt);
    // 실패 후 재도전 때는 몸도 정문 출발점으로 돌아와야 한다. 잡은 자리에서 다시 켜지면
    // 방울을 누르는 프레임에 바로 재접촉한다.
    this.root.position.copy(this.home);
    this.heading = this.opts.yaw;
    this.root.rotation.y = this.heading;
    this.glideVel.set(0, 0, 0);
    this.glideSpeed = 0;
    this.avoidIndex = -1;
    this.avoidSide = 1;
    this.stuckT = 0;
    this.arenaPath.length = 0;
    this.arenaPathIndex = 0;
    this.arenaRepathT = 0;
    this.arenaPathTargetReady = false;
    this.tipReady = false;
    this.neckAimReady = false;
    this.headWReady = false;
    this.lastBendW.set(1, 0, 0);
    this.reach = 0;
    this.hookCur = 0;
    this.ampCur = 0;
    this.wavePhase = 0;
    this.waveSpeedCur = 1.15;
    this.firstStrike = true;
    this.prevPlayerReady = false;
    this.retreatPressure = 0;
    this.retreatCooldown = 0.8;
    this.retreatStrikeIndex = 0;
    this.rangedAttack = false;
    this.rangedReachBlend = 0;
    this.wardBindings = 0;
    this.root.visible = true;
    this.setState('watch');
    this.sfx.rokuroWake(
      this.root.position.x, this.root.position.y + this.opts.height * 0.62, this.root.position.z,
    );
  }

  deactivate() {
    this.root.visible = false;
    this.sfx.rokuroEnd();
    this.prevPlayerReady = false;
    this.retreatPressure = 0;
    this.retreatCooldown = 0.8;
    this.rangedAttack = false;
    this.rangedReachBlend = 0;
    this.neckAimReady = false;
    this.headWReady = false;
    this.setState('dormant');
  }

  private setState(s: RokuroState) {
    this.state = s;
    this.stateT = 0;
    if (s === 'hunt') this.rangedAttack = false;
    const sx = this.root.position.x, sy = this.root.position.y + this.opts.height * 0.78, sz = this.root.position.z;
    if (s === 'coil') this.sfx.rokuroCoil(sx, sy, sz);
    if (s === 'lunge') {
      this.caught = false;
      this.tipReady = false;
      this.sfx.rokuroLunge(sx, sy, sz);
    }
  }

  /** 사당 장애물 원형 근사에 대해 두 점 사이가 비어 있는가. */
  private arenaSegmentClear(
    x0: number, z0: number, x1: number, z1: number,
    padding: number, neckOnly = false,
  ) {
    const arena = this.opts.arena;
    if (!arena) return true;
    const vx = x1 - x0, vz = z1 - z0;
    const vv = vx * vx + vz * vz;
    for (const o of arena.blockers) {
      if (neckOnly && o.blocksNeck === false) continue;
      const u = vv > 1e-6
        ? THREE.MathUtils.clamp(((o.x - x0) * vx + (o.z - z0) * vz) / vv, 0, 1)
        : 0;
      const dx = x0 + vx * u - o.x, dz = z0 + vz * u - o.z;
      const r = o.radius + padding;
      if (dx * dx + dz * dz < r * r) {
        if (neckOnly && vv > 1e-6) {
          // 플레이어는 실제 직육면체 콜라이더의 면 앞에 서 있어도, 추격용 원형 근사에는
          // 끝점이 조금 들어갈 수 있다. 목표에서 몸통 쪽으로 빠져나오는 길이가 짧으면
          // 목 끝만 모서리에 닿은 것으로 보고 허용한다. 반대편까지 관통하는 경로는 그대로 막는다.
          const tx = x1 - o.x, tz = z1 - o.z;
          const c = tx * tx + tz * tz - r * r;
          if (c < 0) {
            const len = Math.sqrt(vv);
            const ux = (x0 - x1) / len, uz = (z0 - z1) / len;
            const b = tx * ux + tz * uz;
            const exitDistance = -b + Math.sqrt(Math.max(0, b * b - c));
            if (exitDistance <= NECK_TARGET_GRACE) continue;
          }
        }
        return false;
      }
    }
    return true;
  }

  /**
   * 사당은 13×10 m 안에 고정 장애물이 일곱 개뿐이다. 전역 NavGrid보다 촘촘한 0.46 m 격자를
   * 그때그때 굽는 편이 싸고 확실하다. 목표는 몸이 접촉 거리까지 접근할 수 있는 가장 가까운
   * 셀이다. 플레이어가 장애물 면에 붙은 경우에는 가장 가까운 열린 셀을 접촉 지점으로 삼는다.
   */
  private planArenaPath(targetX: number, targetZ: number, bodyRadius: number, goalReach: number) {
    const arena = this.opts.arena;
    this.arenaPath.length = 0;
    this.arenaPathIndex = 0;
    if (!arena) return;
    // 경로가 없더라도 매 프레임 A*를 다시 굽지 않는다. 0.55초 뒤 재시도하거나 타깃 이동/막힘이 깨운다.
    this.arenaPathTarget.set(targetX, targetZ);
    this.arenaPathTargetReady = true;
    this.arenaRepathT = 0.55;

    const cell = 0.46;
    const nx = Math.max(2, Math.ceil((arena.maxX - arena.minX) / cell) + 1);
    const nz = Math.max(2, Math.ceil((arena.maxZ - arena.minZ) / cell) + 1);
    const sx = (arena.maxX - arena.minX) / (nx - 1);
    const sz = (arena.maxZ - arena.minZ) / (nz - 1);
    const count = nx * nz;
    const walkable = new Uint8Array(count);
    const wx = (ix: number) => arena.minX + ix * sx;
    const wz = (iz: number) => arena.minZ + iz * sz;
    const clearance = bodyRadius + 0.24;

    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const x = wx(ix), z = wz(iz);
      let open = true;
      for (const o of arena.blockers) {
        const dx = x - o.x, dz = z - o.z, r = o.radius + clearance;
        if (dx * dx + dz * dz < r * r) { open = false; break; }
      }
      if (open) walkable[iz * nx + ix] = 1;
    }

    const nearestOpen = (x: number, z: number) => {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < count; i++) {
        if (!walkable[i]) continue;
        const ix = i % nx, iz = Math.floor(i / nx);
        const dx = wx(ix) - x, dz = wz(iz) - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const start = nearestOpen(this.root.position.x, this.root.position.z);
    if (start < 0) return;

    // 접촉 거리 안이면서 목 경로도 열린 모든 셀이 목표 후보다. 정확한 접촉 셀이 장애물 때문에
    // 없으면 아래 fallback 이 플레이어와 가장 가까운 열린 셀까지 몸통을 밀어 넣는다.
    const goal = new Uint8Array(count);
    let goalCount = 0;
    let fallback = -1, fallbackD = Infinity;
    for (let i = 0; i < count; i++) {
      if (!walkable[i]) continue;
      const ix = i % nx, iz = Math.floor(i / nx), x = wx(ix), z = wz(iz);
      const d = Math.hypot(x - targetX, z - targetZ);
      if (d < fallbackD) { fallbackD = d; fallback = i; }
      if (d <= goalReach && this.arenaSegmentClear(x, z, targetX, targetZ, 0.1, true)) {
        goal[i] = 1; goalCount++;
      }
    }
    if (goalCount === 0 && fallback >= 0) goal[fallback] = 1;

    const g = new Float32Array(count); g.fill(Infinity); g[start] = 0;
    const came = new Int32Array(count); came.fill(-1);
    const closed = new Uint8Array(count);
    const open: number[] = [start];
    const heuristic = (i: number) => {
      const ix = i % nx, iz = Math.floor(i / nx);
      return Math.max(0, Math.hypot(wx(ix) - targetX, wz(iz) - targetZ) - goalReach);
    };
    let end = -1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    while (open.length) {
      let oi = 0, bestF = Infinity;
      for (let i = 0; i < open.length; i++) {
        const f = g[open[i]!]! + heuristic(open[i]!);
        if (f < bestF) { bestF = f; oi = i; }
      }
      const cur = open.splice(oi, 1)[0]!;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (goal[cur]) { end = cur; break; }
      const cx = cur % nx, cz = Math.floor(cur / nx);
      for (const [dx, dz] of dirs) {
        const xx = cx + dx, zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= nx || zz >= nz) continue;
        const ni = zz * nx + xx;
        if (!walkable[ni] || closed[ni]) continue;
        // 대각선으로 장애물 모서리를 뚫지 않는다.
        if (dx && dz && (!walkable[cz * nx + xx] || !walkable[zz * nx + cx])) continue;
        const ng = g[cur]! + (dx && dz ? Math.SQRT2 : 1) * cell;
        if (ng >= g[ni]!) continue;
        g[ni] = ng; came[ni] = cur; open.push(ni);
      }
    }
    if (end < 0) return;

    const raw: THREE.Vector2[] = [];
    for (let p = end; p >= 0 && p !== start; p = came[p]!) {
      raw.push(new THREE.Vector2(wx(p % nx), wz(Math.floor(p / nx))));
      if (came[p]! < 0) break;
    }
    raw.reverse();

    // 격자 계단은 직선 시야가 확보된 노드까지 건너뛰어 자연스러운 활주선으로 줄인다.
    let ax = this.root.position.x, az = this.root.position.z;
    for (let i = 0; i < raw.length;) {
      let best = i;
      for (let j = i; j < raw.length; j++) {
        if (!this.arenaSegmentClear(ax, az, raw[j]!.x, raw[j]!.y, clearance)) break;
        best = j;
      }
      const p = raw[best]!;
      this.arenaPath.push(p);
      ax = p.x; az = p.y; i = best + 1;
    }
  }

  /** @param player 플레이어 위치(월드) */
  update(dt: number, player: THREE.Vector3, motion: RokuroPlayerMotion = { speed: 0, crouching: false }) {
    if (!this.model || this.state === 'dormant') return;
    this.t += dt;
    this.stateT += dt;

    // 정문과 툇마루를 완전히 벗어났으면 이번 추격은 성공. 몸은 사당 밖까지 따라 나오지 않는다.
    if (this.escapeEnabled && this.opts.arena && player.x > this.opts.arena.escapeX) {
      this.deactivate();
      this.onEscape?.();
      return;
    }

    // ---- 추적 + 도주 대응 ----
    // 몸통은 정지 여부와 무관하게 실제 플레이어를 끝까지 쫓는다. 목 공격은 단순 거리나
    // 정지 타이머가 아니라, 플레이어의 실제 이동 벡터가 몸통 반대 방향으로 이어질 때만 열린다.
    let retreatStrikeReady = false;
    let neckPathClear = true;
    {
      const pd = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
      this.known.copy(player);
      neckPathClear = this.arenaSegmentClear(
        this.root.position.x, this.root.position.z, player.x, player.z, 0.1, true,
      );

      let awaySpeed = 0;
      if (this.prevPlayerReady && dt > 1e-5 && pd > 1e-4) {
        const playerDx = player.x - this.prevPlayer.x;
        const playerDz = player.z - this.prevPlayer.z;
        awaySpeed = (playerDx * (player.x - this.root.position.x)
          + playerDz * (player.z - this.root.position.z)) / (dt * pd);
      }
      const movingIntent = motion.moving ?? motion.speed > 0.35;
      const retreating = movingIntent && awaySpeed > 0.45;
      this.prevPlayer.copy(player);
      this.prevPlayerReady = true;
      this.retreatCooldown = Math.max(0, this.retreatCooldown - dt);
      if (this.state === 'hunt') {
        if (retreating) this.retreatPressure = Math.min(RETREAT_ARM_TIME + 0.25, this.retreatPressure + dt);
        else this.retreatPressure = Math.max(0, this.retreatPressure - dt * 2.2);
      }
      retreatStrikeReady = this.retreatPressure >= RETREAT_ARM_TIME
        && this.retreatCooldown <= 0
        && pd >= RETREAT_STRIKE_MIN
        && pd <= RETREAT_STRIKE_MAX;
    }
    const aim = this.tmpV3.copy(this.known);
    const aimX = aim.x, aimY = aim.y, aimZ = aim.z;
    if (!this.neckAimReady) {
      this.neckAim.copy(aim);
      this.neckAimReady = true;
    } else {
      // 타깃·상태가 바뀌어도 목 전체의 굽힘 평면이 한 프레임에 갈아끼워지지 않게 한다.
      const aimRate = this.state === 'lunge' ? 6.2 : this.state === 'coil' ? 4.8 : 3.6;
      this.neckAim.x = damp(this.neckAim.x, aimX, aimRate, dt);
      this.neckAim.y = damp(this.neckAim.y, aimY, aimRate, dt);
      this.neckAim.z = damp(this.neckAim.z, aimZ, aimRate, dt);
    }

    // ---- 몸통 활주 ----
    // 달리면 방울 소리에 반응해 빨라지고, 웅크리면 느려진다. 장애물은 가까이 닿은 뒤
    // 밀어내는 것만으로는 정면 힘과 반발력이 상쇄돼 멈춘다. 목표까지의 선분을 먼저
    // 검사해 기둥/제단 옆의 지속적인 우회점을 고른다.
    const movingState = this.state === 'hunt';
    let desiredSpeed = 0;
    let lineBlocked = false;
    const attackBlocked = !neckPathClear;
    const steer = this.tmpV.set(0, 0, 0);
    if (movingState) {
      const dx = aimX - this.root.position.x, dz = aimZ - this.root.position.z;
      const hd = Math.hypot(dx, dz);
      if (hd > 0.001) steer.set(dx / hd, 0, dz / hd);
      if (motion.ringing) desiredSpeed = 3.15;        // 방울이 부른다
      else if (motion.crouching) desiredSpeed = 1.15;
      else if (motion.speed > 2.6) desiredSpeed = 3.15;
      else desiredSpeed = 2.2;
      desiredSpeed *= this.threatScale * (1 - this.wardBindings * 0.06);
      const arena = this.opts.arena;
      if (arena && hd > 0.001) {
        const bodyRadius = this.opts.height * 0.32;
        // 몸통은 여유 반경까지 피하고, 목은 기둥·제단만 가린다. 낮은 경상 너머는 공격 가능하다.
        lineBlocked = !this.arenaSegmentClear(
          this.root.position.x, this.root.position.z, aimX, aimZ, bodyRadius + 0.28,
        );
        let blockI = -1, bestAlong = Infinity;
        for (let i = 0; i < arena.blockers.length; i++) {
          const o = arena.blockers[i]!;
          const rx = o.x - this.root.position.x, rz = o.z - this.root.position.z;
          const along = rx * (dx / hd) + rz * (dz / hd);
          if (along <= 0.08 || along >= hd - 0.08) continue;
          const sideDist = Math.abs((dx / hd) * rz - (dz / hd) * rx);
          if (sideDist < o.radius + bodyRadius + 0.28 && along < bestAlong) {
            blockI = i; bestAlong = along;
          }
        }

        if (blockI >= 0) {
          const o = arena.blockers[blockI]!;
          const ox = o.x - this.root.position.x, oz = o.z - this.root.position.z;
          const od = Math.max(0.001, Math.hypot(ox, oz));
          const px = -oz / od, pz = ox / od;
          const clear = o.radius + bodyRadius + 0.52;
          if (this.avoidIndex !== blockI) {
            const cost = (side: -1 | 1) => {
              const wx = o.x + px * side * clear, wz = o.z + pz * side * clear;
              let c = Math.hypot(wx - this.root.position.x, wz - this.root.position.z)
                + Math.hypot(aimX - wx, aimZ - wz);
              if (wx < arena.minX + 0.2 || wx > arena.maxX - 0.2
                || wz < arena.minZ + 0.2 || wz > arena.maxZ - 0.2) c += 8;
              return c;
            };
            const left = cost(-1), right = cost(1);
            this.avoidSide = Math.abs(left - right) < 0.08 ? this.avoidSide : left < right ? -1 : 1;
            this.avoidIndex = blockI;
          }
          const wx = o.x + px * this.avoidSide * clear;
          const wz = o.z + pz * this.avoidSide * clear;
          steer.set(wx - this.root.position.x, 0, wz - this.root.position.z);
          if (steer.lengthSq() > 0.001) steer.normalize();
        } else {
          this.avoidIndex = -1;
        }

        // 마지막 안전망: 이미 반경 안에 들어온 경우 바깥쪽 + 선택한 접선으로 밀어낸다.
        for (let i = 0; i < arena.blockers.length; i++) {
          const o = arena.blockers[i]!;
          const ox = this.root.position.x - o.x, oz = this.root.position.z - o.z;
          const d = Math.hypot(ox, oz);
          const keep = o.radius + bodyRadius + 0.42;
          if (d < keep && d > 0.001) {
            const k = (1 - d / keep) * 3.2;
            steer.x += (ox / d) * k;
            steer.z += (oz / d) * k;
            if (i === this.avoidIndex) {
              steer.x += (oz / d) * this.avoidSide * 1.3;
              steer.z += (-ox / d) * this.avoidSide * 1.3;
            }
          }
        }

        // 단일 접선 회피는 책상+기둥처럼 반경이 겹치면 양쪽 선택을 반복한다.
        // A*가 만든 지속 waypoint를 우선해 복수 장애물 바깥까지 한 번에 빠져나간다.
        if (lineBlocked) {
          this.arenaRepathT -= dt;
          const pathDx = this.arenaPathTarget.x - aimX, pathDz = this.arenaPathTarget.y - aimZ;
          const targetMoved = !this.arenaPathTargetReady || pathDx * pathDx + pathDz * pathDz > 0.55 * 0.55;
          if (this.arenaRepathT <= 0 || targetMoved) {
            this.planArenaPath(
              aimX, aimZ, bodyRadius,
              BODY_CONTACT_RANGE + 0.1,
            );
          }
          while (this.arenaPathIndex < this.arenaPath.length) {
            const p = this.arenaPath[this.arenaPathIndex]!;
            if (Math.hypot(p.x - this.root.position.x, p.y - this.root.position.z) >= 0.4) break;
            this.arenaPathIndex++;
          }
          const p = this.arenaPath[this.arenaPathIndex];
          if (p) {
            steer.set(p.x - this.root.position.x, 0, p.y - this.root.position.z);
            if (steer.lengthSq() > 0.001) steer.normalize();
          }
        } else {
          this.arenaPath.length = 0;
          this.arenaPathIndex = 0;
          this.arenaPathTargetReady = false;
        }
      }
      // 목 공격 사거리에서 멈추지 않는다. 몸이 미오와 맞닿아 보일 때만 속도를 거둔다.
      if (hd < BODY_CONTACT_RANGE && !lineBlocked) desiredSpeed = 0;
      if (steer.lengthSq() > 0.001) steer.normalize();
    }
    this.glideSpeed = damp(this.glideSpeed, desiredSpeed, desiredSpeed > this.glideSpeed ? 4.2 : 10.0, dt);
    const vx = steer.x * this.glideSpeed, vz = steer.z * this.glideSpeed;
    this.glideVel.x = damp(this.glideVel.x, vx, 6.5, dt);
    this.glideVel.z = damp(this.glideVel.z, vz, 6.5, dt);
    const oldX = this.root.position.x, oldZ = this.root.position.z;
    this.root.position.x += this.glideVel.x * dt;
    this.root.position.z += this.glideVel.z * dt;
    if (this.opts.arena) {
      const a = this.opts.arena;
      this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, a.minX, a.maxX);
      this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, a.minZ, a.maxZ);
      // 조향이 늦어 장애물 안으로 파고들면 접선 방향으로 밀어낸다.
      for (const o of a.blockers) {
        const ox = this.root.position.x - o.x, oz = this.root.position.z - o.z;
        const d = Math.hypot(ox, oz), keep = o.radius + this.opts.height * 0.32;
        if (d < keep) {
          const nx = d > 0.001 ? ox / d : 1, nz = d > 0.001 ? oz / d : 0;
          this.root.position.x = o.x + nx * keep;
          this.root.position.z = o.z + nz * keep;
        }
      }
      this.root.position.y = a.floorY + 0.02 * Math.sin(this.t * 2.1) + 0.012 * Math.sin(this.t * 3.7 + 1.1);
    }
    // 감속 보간만 두면 0.72m 정지선을 지난 뒤 몸 중심이 플레이어를 관통해 반대편으로 간다.
    // 직접 경로가 열린 경우에는 접촉 원 위에 고정해 실제 몸끼리 부딪힌 것처럼 압박한다.
    if (movingState && neckPathClear) {
      let cx = this.root.position.x - player.x, cz = this.root.position.z - player.z;
      let cd = Math.hypot(cx, cz);
      if (cd < BODY_CONTACT_RANGE) {
        if (cd < 1e-4) {
          cx = oldX - player.x;
          cz = oldZ - player.z;
          cd = Math.hypot(cx, cz);
          if (cd < 1e-4) {
            cx = -Math.sin(this.heading);
            cz = -Math.cos(this.heading);
            cd = 1;
          }
        }
        this.root.position.x = player.x + cx / cd * BODY_CONTACT_RANGE;
        this.root.position.z = player.z + cz / cd * BODY_CONTACT_RANGE;
        this.glideVel.set(0, 0, 0);
        this.glideSpeed = 0;
      }
    }
    const movedX = this.root.position.x - oldX, movedZ = this.root.position.z - oldZ;
    const actualSpeed = dt > 0 ? Math.hypot(movedX, movedZ) / dt : 0;
    if (movingState && desiredSpeed > 0.2 && actualSpeed < 0.12) {
      this.stuckT += dt;
      if (this.stuckT > 0.45) {
        this.avoidSide = this.avoidSide === 1 ? -1 : 1;
        // 선택한 경로 자체가 좁은 모서리에 걸렸다면 다음 프레임에 다른 셀 경로를 즉시 굽는다.
        this.arenaPath.length = 0;
        this.arenaPathIndex = 0;
        this.arenaPathTargetReady = false;
        this.arenaRepathT = 0;
        this.stuckT = 0;
      }
    } else if (actualSpeed > 0.2 || !movingState) {
      this.stuckT = 0;
    }
    this.sfx.rokuroGlide(
      this.root.position.x, this.root.position.y + this.opts.height * 0.42, this.root.position.z,
      actualSpeed, dt,
    );
    if (actualSpeed > 0.04) {
      const wantYaw = Math.atan2(movedX, movedZ); // 모델 정면 = +Z
      this.heading = dampAngle(this.heading, wantYaw, 5.0, dt);
    }
    this.root.rotation.y = this.heading;

    // ---- 타깃을 **모델 단위**로 (몸이 어느 쪽을 보든 조준이 맞는 이유 — glide 계약) ----
    // root 는 위치·회전만 갖고 스케일은 model 자식에 있다. 그래서 worldToLocal 은 미터를 주고,
    // 체인 수식은 모델 단위(키 0.98)로 돼 있으므로 스케일만 한 번 벗긴다
    const tp = this.tmpV.copy(this.neckAim);
    tp.y += 0.6;   // 가슴 높이를 노린다
    this.root.worldToLocal(tp);
    tp.multiplyScalar(0.98 / this.opts.height);

    const D = this.tmpV2.copy(tp).sub(this.tmpV3.set(0, BASE_Y, 0));
    const dist = D.length();
    const Dn = D.normalize();
    const distWorld = dist * (this.opts.height / 0.98);
    const horizontalDist = Math.hypot(aimX - this.root.position.x, aimZ - this.root.position.z);

    // ---- 상태 전이 ----
    const LOSE_RANGE = 7.0;
    switch (this.state) {
      case 'watch':
        if (this.stateT > this.openingDelay) this.setState('hunt');
        break;
      case 'hunt':
        // 가만히 있거나 다가오는 플레이어에게는 몸통으로 끝까지 붙는다. 플레이어가 반대 방향으로
        // 계속 달아날 때만, 재사용 대기가 끝난 경우 간헐적으로 목을 뻗는다.
        if (!attackBlocked && retreatStrikeReady) {
          this.rangedAttack = true;
          this.retreatPressure = 0;
          this.retreatCooldown = 3.2 + (this.retreatStrikeIndex % 3) * 0.7;
          this.retreatStrikeIndex++;
          this.setState('coil');
        }
        else if (!this.opts.arena && distWorld > LOSE_RANGE) this.setState('retract');
        break;
      case 'coil':
        if (this.stateT > (this.firstStrike ? 0.72 : 0.56)) {
          this.firstStrike = false;
          this.setState('lunge');
        }
        break;
      case 'lunge':
        if (this.stateT > 0.62) this.setState('settle');
        break;
      case 'settle':
        if (this.stateT > 0.5) this.setState(!this.opts.arena && distWorld > LOSE_RANGE ? 'retract' : 'hunt');
        break;
      case 'retract':
        if (this.stateT > 0.8) this.setState('watch');
        break;
    }

    // ---- 상태별 목표값 (프리뷰의 단계표) ----
    let reachT = 0, hookT = 0, ampT = 0, w = 2.0;
    switch (this.state) {
      // 진폭·각속도는 2026-08-25 에 전 구간 ×0.7 로 낮췄다 — 「너무 다이나믹하다」.
      // 사거리·타이밍(reach/hook/stateT)은 건드리지 않았다. 공격 판정은 그대로다.
      case 'watch': reachT = 0.22; hookT = 12; ampT = 3.5; w = 1.15; break;
      case 'hunt': {
        const closeK = THREE.MathUtils.clamp(1 - (distWorld - NECK_NEAR_RANGE) / 3, 0, 1);
        const speedK = THREE.MathUtils.clamp(actualSpeed / 3.1, 0, 1);
        reachT = 0.26 + 0.29 * closeK;
        hookT = 14 + 8 * closeK;
        ampT = 5 + 4 * speedK;
        w = 1.35 + 0.7 * speedK;
        break;
      }
      // 뒤로 잡아당기지 않는다. 길이는 유지하고 파도의 곡률만 옆으로 감아 런지를 준비한다.
      case 'coil': reachT = 0.55; hookT = 22; ampT = 7; w = 1.8; break;
      case 'lunge': {
        const u = Math.min(1, this.stateT / 0.62);
        const k = u * u * (3 - 2 * u); // smoothstep — 속도 불연속 없이 뱀처럼 밀고 들어온다
        reachT = 0.55 + 0.43 * k; hookT = 22 + 8 * k; ampT = 6.5; w = 2.1; break;
      }
      // 오버슛·반동 없이 뻗은 길이를 잠시 유지한다.
      case 'settle': reachT = 0.9; hookT = 28; ampT = 6; w = 1.75; break;
      case 'retract': reachT = 0.15; hookT = 12; ampT = 3.5; w = 1.15; break;
    }
    // 되묶인 금줄은 목의 최대 전개를 단계적으로 줄인다. 문이 열린 뒤에도 마지막 질주는 남는다.
    reachT *= 1 - this.wardBindings * 0.1;
    // 모든 상태를 감쇠 보간한다. 즉시 대입·감쇠 사인 오버슛이 목이 고무줄처럼 튀던 원인이었다.
    const poseRate = this.state === 'lunge' ? 9 : this.state === 'coil' ? 7 : 6;
    // 장거리 런지 직후 hunt 목표(.26 부근)로 돌아갈 때 일반 poseRate 를 쓰면 5m 목이
    // 프레임당 수십 cm씩 접힌다. 추격은 즉시 재개하되 목 길이 회수만 별도 감쇠한다.
    const reachRate = this.state === 'hunt' && reachT < this.reach ? 1.6 : poseRate;
    this.reach = damp(this.reach, reachT, reachRate, dt);
    this.hookCur = damp(this.hookCur, hookT, poseRate, dt);
    this.ampCur = damp(this.ampCur, ampT, poseRate, dt);
    this.waveSpeedCur = damp(this.waveSpeedCur, w, 4.5, dt);
    this.wavePhase += this.waveSpeedCur * dt;
    const A = THREE.MathUtils.degToRad(this.ampCur);
    const hook = THREE.MathUtils.degToRad(this.hookCur);

    // ---- 체인 포즈 (프리뷰 공식 그대로) ----
    const theta = Math.acos(THREE.MathUtils.clamp(Dn.y, -1, 1));
    // 굽힘면 법선. 타깃이 목 밑동의 **바로 위·아래**로 오면 UP×Dn 이 0 이 된다 — 거기서
    // (1,0,0) 으로 리셋하면 굽힘면이 한 프레임에 통째로 돌아 목이 튄다(「갑자기 확 튀고」).
    // 직전 축을 들고 지나가면 특이점을 통과하는 동안 평면이 유지된다.
    const desiredBendW = this.tmpV3.copy(UP).cross(Dn);
    if (desiredBendW.lengthSq() >= 1e-6) {
      desiredBendW.normalize();
      // 목표가 몸을 가로질러도 굽힘면을 즉시 뒤집지 않는다. 직전 축에서 새 축까지
      // 최단 회전을 감쇠해, 목 전체가 한 프레임에 다른 평면으로 갈아타는 현상을 없앤다.
      this.tmpQ.setFromUnitVectors(this.lastBendW, desiredBendW);
      this.tmpQ2.identity().slerp(this.tmpQ, 1 - Math.exp(-dt * 5.2));
      this.lastBendW.applyQuaternion(this.tmpQ2).normalize();
    }
    const wAxis = this.tmpV3.copy(this.lastBendW);
    const lAxis = this.bendAxis.copy(wAxis).applyQuaternion(this.chainRestInv).normalize();
    // 파도 축: 모델 X 와 정면(+Z) — 본 로컬로
    const lwx = this.waveAxisX.set(1, 0, 0).applyQuaternion(this.chainRestInv).normalize();
    const lwz = this.waveAxisZ.set(0, 0, 1).applyQuaternion(this.chainRestInv).normalize();
    const speedK = THREE.MathUtils.clamp(actualSpeed / 3.1, 0, 1);

    const Lchain = Math.max(0, this.reach * dist - HEAD_L);
    this.rangedReachBlend = damp(
      this.rangedReachBlend, this.rangedAttack ? 1 : 0,
      this.rangedAttack ? 6.5 : 1.4, dt,
    );
    const segMax = THREE.MathUtils.lerp(SEG_MAX, SEG_MAX_RANGED, this.rangedReachBlend);
    const seg = this.reach > 0 ? Math.max(0, Math.min(segMax, (Lchain - 0.17) / RAMPs)) : 0;

    for (let i = 0; i < NECK_N; i++) {
      const b = this.neck[i];
      if (!b) continue;
      const bend = theta * BW[i]! / BWs + hook * (HOOK_Ws ? HOOK_W[i]! / HOOK_Ws : 0);
      const q = this.tmpQ.setFromAxisAngle(lAxis, bend);
      // 하단 1/3 은 진행 반대로 뒤처진다. 속도가 붙을수록 목이 몸통 이동을 한 박자 늦게 받는다.
      if (i < NECK_N * 0.33) {
        const trailW = Math.max(0, Math.sin(Math.PI * (0.5 + i) / (NECK_N * 0.66)));
        q.multiply(this.tmpQ2.setFromAxisAngle(lwx, -THREE.MathUtils.degToRad(14) * speedK * trailW * 0.55));
      }
      q.multiply(this.tmpQ2.setFromAxisAngle(lwx, A * WENV[i]! * 0.8 * Math.sin(this.wavePhase - i * PHI)));
      q.multiply(this.tmpQ2.setFromAxisAngle(lwz, A * WENV[i]! * Math.sin(this.wavePhase * 0.83 - i * PHI + 1.3)));
      b.quaternion.copy(this.restQ.get(b)!).multiply(q);
      const rp = this.restP.get(b)!;
      b.position.set(rp.x, rp.y + seg * RAMP[i]!, rp.z);
    }

    // 몸은 진행 방향으로 기울고 상체는 목 파도보다 느리게 따라온다. 얼굴은 아래 lookAt 이
    // 다시 플레이어를 잡기 때문에 몸과 얼굴 방향의 불일치가 유지된다.
    if (this.bodyRoot) {
      const lean = THREE.MathUtils.degToRad(7) * speedK;
      const q = this.tmpQ.setFromAxisAngle(this.waveAxisX.set(1, 0, 0), lean);
      this.bodyRoot.quaternion.copy(this.restQ.get(this.bodyRoot)!).multiply(q);
    }
    if (this.spine) {
      const sway = THREE.MathUtils.degToRad(1.2 + 2.0 * speedK) * Math.sin(this.t * (0.9 + 2.0 * speedK));
      this.spine.quaternion.copy(this.restQ.get(this.spine)!).multiply(this.tmpQ.setFromAxisAngle(this.waveAxisX.set(1, 0, 0), sway));
    }
    if (this.chest) {
      const sway = THREE.MathUtils.degToRad(1.5 + 1.5 * speedK) * Math.sin(this.t * (0.9 + 2.0 * speedK) + 0.4);
      this.chest.quaternion.copy(this.restQ.get(this.chest)!).multiply(this.tmpQ.setFromAxisAngle(this.waveAxisX.set(1, 0, 0), sway));
    }

    /**
     * ---- 머리: **rest 기준으로 매 프레임 새로 짓는** lookAt + 갸웃 롤 ----
     *
     * 예전에는 지난 프레임의 머리 월드 자세에 시선 델타와 갸웃을 얹었다. 그런데
     * `setFromUnitVectors` 는 **최소 회전**이라 시선축 둘레의 롤을 절대 건드리지 않는다 —
     * 즉 갸웃이 매 프레임 지워지지 않고 **적분됐다**. 초당 수 라디안씩 쌓이니
     * 얼굴이 시선축을 축으로 계속 돌아갔다(사용자 리포트 「얼굴이 360도 돌아간다」).
     *
     * 이제 목표 자세를 목 끝(부모 본)의 rest 에서 새로 만든다. 갸웃은 목표에 얹히므로
     * 절대값이 되고, 스윙 각을 잘라 두면 180° 특이점(축이 임의로 뒤집히며 튀던 순간)도
     * 함께 사라진다. 감쇠는 본 로컬이 아니라 **월드 자세 하나**(headW)에서만 돈다.
     */
    if (this.head) {
      this.model.updateWorldMatrix(true, true);
      const parent = this.head.parent!;
      const headPos = this.head.getWorldPosition(this.tmpV2);
      // 목과 얼굴이 같은 감쇠 목표를 공유해야 플레이어 좌표가 급변해도 얼굴만 먼저 튀지 않는다.
      const dirW = this.tmpV3.copy(this.neckAim); dirW.y += 0.55;
      dirW.sub(headPos).normalize();

      // 목 끝을 따라간 머리의 rest 월드 자세 — 모든 계산의 기준점
      const restW = this.tmpQ4.copy(this.restQ.get(this.head)!).premultiply(parent.getWorldQuaternion(this.tmpQ));
      const faceRest = this.tmpV4.copy(this.faceLocal).applyQuaternion(restW).normalize();
      this.tmpQ2.setFromUnitVectors(faceRest, dirW);
      // 스윙 각 제한 — 얼굴은 목이 데려다준 방향에서 105° 까지만 더 돌아간다.
      // 나머지는 목이 감아 와서 채운다(그게 코브라 훅이 하는 일이다)
      if (this.tmpQ2.w < 0) { this.tmpQ2.x *= -1; this.tmpQ2.y *= -1; this.tmpQ2.z *= -1; this.tmpQ2.w *= -1; }
      const swing = 2 * Math.acos(THREE.MathUtils.clamp(this.tmpQ2.w, -1, 1));
      if (swing > HEAD_MAX_SWING) {
        const sn = Math.sqrt(Math.max(1e-9, 1 - this.tmpQ2.w * this.tmpQ2.w));
        this.tmpQ2.setFromAxisAngle(
          this.tmpV.set(this.tmpQ2.x / sn, this.tmpQ2.y / sn, this.tmpQ2.z / sn),
          HEAD_MAX_SWING,
        );
      }
      this.headTargetW.copy(restW).premultiply(this.tmpQ2);
      // 갸웃 — 시선축 둘레 롤. 목표에 얹으므로 각도 그대로 멈춘다(누적되지 않는다)
      const tilt = 0.24 * Math.sin(this.t * 0.5) * Math.sin(this.t * 0.23 + 1.0);
      this.headTargetW.premultiply(this.tmpQ2.setFromAxisAngle(dirW, tilt));

      // 머리는 목이 도착한 다음에 천천히 정렬한다 — 뱀의 머리는 목보다 한 박자 늦다.
      // 무는 순간(lunge·settle)만 빠르게 맞춘다. 안 그러면 조준과 잡기 판정이 어긋난다
      const headRate = this.state === 'lunge' ? 5.2 : this.state === 'settle' ? 4.6 : 2.8;
      if (!this.headWReady) { this.headW.copy(this.headTargetW); this.headWReady = true; }
      else this.headW.slerp(this.headTargetW, 1 - Math.exp(-dt * headRate));
      parent.getWorldQuaternion(this.tmpQ3).invert();
      this.head.quaternion.copy(this.tmpQ3.multiply(this.headW));
      // 잡기 판정은 시선이 아니라 **실제로 향한 방향**을 쓴다 (스윙이 잘리면 둘이 다르다)
      const faceNow = this.tmpV.copy(this.faceLocal).applyQuaternion(this.headW).normalize();

      // ---- 잡기 판정: 머리끝 현재점 + 이전 프레임부터의 선분. 빠르게 지나쳐도 놓치지 않는다 ----
      if ((this.state === 'lunge' || this.state === 'settle') && !this.caught) {
        const tip = headPos.addScaledVector(faceNow, 0.15 * (this.opts.height / 0.98));
        this.tmpV.copy(player); this.tmpV.y += 0.6;
        const catchRadius = 1.05;
        let hit = tip.distanceToSquared(this.tmpV) < catchRadius * catchRadius;
        if (!hit && this.tipReady) {
          const vx = tip.x - this.prevTip.x, vy = tip.y - this.prevTip.y, vz = tip.z - this.prevTip.z;
          const wx = this.tmpV.x - this.prevTip.x, wy = this.tmpV.y - this.prevTip.y, wz = this.tmpV.z - this.prevTip.z;
          const vv = vx * vx + vy * vy + vz * vz;
          const u = vv > 1e-6 ? THREE.MathUtils.clamp((wx * vx + wy * vy + wz * vz) / vv, 0, 1) : 0;
          const cx = this.prevTip.x + vx * u, cy = this.prevTip.y + vy * u, cz = this.prevTip.z + vz * u;
          const ex = this.tmpV.x - cx, ey = this.tmpV.y - cy, ez = this.tmpV.z - cz;
          hit = ex * ex + ey * ey + ez * ez < catchRadius * catchRadius;
        }
        // 리깅 머리 중심이 머리카락 부피 때문에 높게 잡힌 프레임도 있다. 이미 깨끗한 경로로
        // 사거리 안에서 런지를 절반 이상 수행했다면 몸통 거리도 공격 캡슐의 보조 판정으로 쓴다.
        if (!hit && this.state === 'lunge' && this.stateT > 0.38
          && !attackBlocked && horizontalDist < 2.25) hit = true;
        this.prevTip.copy(tip);
        this.tipReady = true;
        if (hit) {
          this.caught = true;
          this.sfx.rokuroCatch(tip.x, tip.y, tip.z);
          this.onCatch?.();
          return;
        }
      } else this.tipReady = false;
    }

    // 머리카락은 목 본 가중치에서 완전히 분리된 Head 자식 본이다. 목의 위상파를 복사하지 않고
    // 좌우가 서로 다른 느린 위상 + 활주 방향 관성만 받아 한 덩어리처럼 붙어 보이지 않는다.
    const striking = this.state === 'coil' || this.state === 'lunge' || this.state === 'settle';
    if (this.hairL) this.poseHair(this.hairL, 1, speedK, striking);
    if (this.hairR) this.poseHair(this.hairR, -1, speedK, striking);

    // ---- 팔: 부유(비대칭 위상) + 상태 전이 + 잔떨림 (glide 의 5겹 — 활주 항 제외) ----
    if (this.armL && this.armR) {
      const dnBase = striking ? 22 : 30;
      const fwBase = this.state === 'lunge' || this.state === 'settle' ? 26 : this.state === 'coil' ? 6 : 8;
      const trem = striking ? 0.021 * Math.sin(this.t * 14) : 0;
      const dnL = THREE.MathUtils.degToRad(dnBase) + 0.061 * Math.sin(this.t * 0.9 + 0.7) + trem;
      const dnR = THREE.MathUtils.degToRad(dnBase) + 0.061 * Math.sin(this.t * 0.8 + 2.4) + trem;
      const fwL = THREE.MathUtils.degToRad(fwBase) + 0.07 * Math.sin(this.t * 0.7 + 0.2) - 0.16 * speedK;
      const fwR = THREE.MathUtils.degToRad(fwBase) + 0.07 * Math.sin(this.t * 0.63 + 1.9) - 0.16 * speedK;
      const twL = 0.087 * Math.sin(this.t * 0.8 + 1.1);
      const twR = 0.087 * Math.sin(this.t * 0.74 + 3.0);
      this.poseArm(this.armL, dnL, -fwL, twL);
      this.poseArm(this.armR, -dnR, fwR, twR);
    }
  }

  /** 목과 다른 주기의 머리카락 보조 모션 — 스프링/오버슛 없이 느린 사인만 사용한다 */
  private poseHair(b: THREE.Bone, side: -1 | 1, speedK: number, striking: boolean) {
    const phase = side > 0 ? 0.35 : 1.55;
    const trail = 0.055 * Math.sin(this.t * 1.35 + phase) + 0.09 * speedK;
    const spread = side * 0.045 * Math.sin(this.t * 0.92 + phase)
      + (striking ? 0.025 * Math.sin(this.t * 2.1 + phase) : 0);
    const q = this.tmpQ.setFromAxisAngle(this.waveAxisX.set(1, 0, 0), trail);
    q.multiply(this.tmpQ2.setFromAxisAngle(this.waveAxisZ.set(0, 0, 1), spread));
    b.quaternion.copy(this.restQ.get(b)!).multiply(q);
  }

  /** 팔 포즈: 내림(모델 +Y 축) · 앞으로(모델 +Z 축) · 본 축 롤 — glide 와 같은 축 규약 */
  private poseArm(b: THREE.Bone, dn: number, fw: number, tw: number) {
    const restInv = this.tmpQ3.copy(this.restQ.get(b)!).invert();
    // 팔 본의 rest 로컬 축으로 모델 축을 옮긴다 (체인과 달리 팔은 옆으로 누워 있다)
    const ay = this.tmpV.set(0, 1, 0).applyQuaternion(restInv).normalize();
    const az = this.tmpV2.set(0, 0, 1).applyQuaternion(restInv).normalize();
    const q = this.tmpQ.setFromAxisAngle(ay, dn);
    q.multiply(this.tmpQ2.setFromAxisAngle(az, fw));
    q.multiply(this.tmpQ2.setFromAxisAngle(this.tmpV.set(0, 1, 0), tw));
    b.quaternion.copy(this.restQ.get(b)!).multiply(q);
  }
}
