import * as THREE from 'three';
import { Props } from '@/world/props';
import { dampAngle } from '@/core/math';
import type { Physics } from '@/core/physics';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Sfx } from '@/audio/sfx';
import type { SchoolInterior } from '@/world/higasato/school';

/**
 * 나츠메 유리 — 폐교의 얼굴 없는 학생 (ACT 8~9, PLAN-STORY §5.3.2)
 *
 * **바라보면 정지, 시야를 벗어나면 접근.** 이 규칙의 결론은 하나다 —
 * **그녀는 절대 움직이는 모습을 보여주지 않는다.** 그래서 애니메이션이 없다.
 * 정적 모델(yokai-noppera.glb 재사용, §9.1)이고, 안 보는 동안만 위치가 바뀐다.
 * 플레이어가 돌아봤을 때 「아까보다 가까이 서 있다」 — 그게 이 보스의 전부다.
 *
 * ## 「본다」의 정의 — 셋 다 만족해야 정지한다
 *   ① 화면 안: 카메라 전방과의 각이 FOV 절반(+여유) 이내
 *   ② 가려지지 않음: 카메라 → 그녀 머리로 물리 레이 (칸막이 콜라이더가 막는다 —
 *      벽 너머는 「보이지 않는 것」이다. 책상은 0.66 m 라 눈높이 레이가 넘어간다)
 *   ③ 그녀가 근거리: 12 m 밖은 어둠이 삼킨다 (초칭 사거리 밖은 본 것이 아니다)
 *
 * ## 신호는 발소리가 아니다 (§5.3.2)
 * **발소리는 끝까지 없다.** 접근을 알리는 건 셋뿐이다 —
 * **형광등 깜빡임**(거리 반비례로 school.setFlicker) · **책상 긁는 소리**(이동 중 불규칙 간격) ·
 * **그녀의 흥얼거림**(2026-08-27 추가).
 *
 * 흥얼거림이 규칙을 깨지 않는 이유: **그녀가 얼면 노래도 끊긴다.** 소리가 들려 돌아보면 정적이고,
 * 등을 돌리면 아까보다 가까운 데서 다시 시작한다. 「보면 멈춘다」를 눈이 아니라 귀로 가르치는 장치다.
 * 그래서 소리는 `!visible` 안에서만 나고, 어는 프레임에 `sfx.yuriHumStop()` 이 불린다.
 *
 * ## 잡히면 — §5.3.2
 * 화면 가득 얼굴 없는 얼굴 + 「내 이름…」 → 입구 체크포인트, 사망 +1. **머리빗은 뺏지 않는다**
 * (로쿠로쿠비와 다르다 — 그녀가 원하는 건 물건이 아니라 이름이다). 처리는 main 이 한다.
 *
 * ## 이동 물리
 * 본체는 Rapier 캡슐로 벽·가구와 충돌하고, 정면이 막히면 좌우 슬라이딩 경로를 시험한다.
 * 창밖·천장의 불가능한 출현은 저비용 잔상 빌보드가 담당한다. 본체까지 벽을 통과시키면
 * 팔과 몸 절반이 회벽 밖으로 나오는 시각 오류가 생기므로 둘의 역할을 분리한다.
 */

export type YuriState = 'dormant' | 'haunt' | 'stalk';

export interface YuriOpts {
  url: string;
  height: number;
}

export class Yuri {
  readonly root = new THREE.Group();
  state: YuriState = 'dormant';
  /** 그녀의 손이 닿았다 — 연출·체크포인트·사망 카운트는 main 이 */
  onCatch: (() => void) | null = null;

  private model: THREE.Object3D | null = null;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private mover: RAPIER.KinematicCharacterController;
  private bodyRadius = 0.34;
  private moveDesired = { x: 0, y: 0, z: 0 };
  private moveDirect = new THREE.Vector3();
  private moveLeft = new THREE.Vector3();
  private moveRight = new THREE.Vector3();
  /** 벽을 따라갈 방향을 유지한다. 매 프레임 좌우를 바꾸면 벽 앞에서 떨기만 한다. */
  private avoidSide: -1 | 1 = 1;
  private heading = 0;
  private frozen = false;
  private scrapeT = 1.5;
  /** 흥얼거림 간격 — 단편이 1.3~2.9 s 라 이보다 길게 둬야 겹치지 않는다 */
  private humT = 2.0;
  private caughtCooldown = 0;
  /** 접촉 연출만의 재발동 방지. 이동 예고 시간과 분리해야 얼어 있는 유리에게 닿아도 반응한다. */
  private touchCooldown = 0;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  private clueProgress = 0;
  private named = false;
  /** 가짜 출석 방송에 대신 대답했다. 유리는 더 일찍 깨어나고 머리빗 추격도 빨라진다. */
  private provoked = false;
  private hiddenT = 0;
  private hiddenResolved = false;
  /** 첫 출현의 위치와 규칙을 읽는 시간. 이 동안 형광등·소리만 반응하고 유리는 움직이지 않는다. */
  private telegraphT = 0;
  /** 빗 획득 전 접촉: 원래 자리에서 점멸해 사라진 뒤 먼 교실에서 다시 선다. */
  private vanishT = 0;
  private vanishMoved = false;
  private readonly vanishDuration = 1.45;

  constructor(
    private opts: YuriOpts,
    private school: SchoolInterior,
    private physics: Physics,
    private sfx: Sfx,
  ) {
    this.root.visible = false;
    const start = school.spawns[0] ?? new THREE.Vector3(
      (school.bounds.minX + school.bounds.maxX) / 2,
      school.bounds.floorY,
      (school.bounds.minZ + school.bounds.maxZ) / 2,
    );
    this.root.position.copy(start);
    const R = physics.R;
    const halfHeight = Math.max(0.08, opts.height * 0.5 - this.bodyRadius);
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(start.x, school.bounds.floorY + opts.height * 0.5 + 0.03, start.z)
        .setEnabled(false),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, this.bodyRadius).setFriction(0),
      this.body,
    );
    this.mover = physics.world.createCharacterController(0.03);
    this.mover.setSlideEnabled(true);
    this.mover.enableAutostep(0.16, 0.1, false);
  }

  async load() {
    const gltf = await Props.loader().loadAsync(this.opts.url);
    const m = gltf.scene;
    // noppera 모델의 실측 키에 맞춰 스케일 (바운딩에서 산출)
    const box = new THREE.Box3().setFromObject(m);
    const h = Math.max(0.01, box.max.y - box.min.y);
    m.scale.setScalar(this.opts.height / h);
    m.position.y = -box.min.y * (this.opts.height / h);
    // 팔·치맛자락까지 포함한 실제 수평 폭으로 캡슐을 다시 맞춘다. 0.48 m 상한은
    // 1.1 m 미닫이문을 통과할 최소 여유를 보존하면서 대부분의 정적 포즈를 감싼다.
    m.updateWorldMatrix(true, true);
    const scaledBox = new THREE.Box3().setFromObject(m);
    const radialExtent = Math.max(
      Math.abs(scaledBox.min.x), Math.abs(scaledBox.max.x),
      Math.abs(scaledBox.min.z), Math.abs(scaledBox.max.z),
    );
    this.bodyRadius = THREE.MathUtils.clamp(radialExtent + 0.045, 0.32, 0.48);
    this.collider.setShape(new this.physics.R.Capsule(
      Math.max(0.08, this.opts.height * 0.5 - this.bodyRadius),
      this.bodyRadius,
    ));
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    });
    this.model = m;
    this.root.add(m);
    this.syncBodyNow();
  }

  /** 체크포인트 복원 시 방송 선택 결과만 다시 주입한다. 순간 추격 상태는 저장하지 않는다. */
  configureResponse(answered: boolean) { this.provoked = answered; }

  /** 가짜 출석에 답했다 — 단서 수와 무관하게 복도에서 즉시 약한 추격을 시작한다. */
  provokeByAnswer(playerPos: THREE.Vector3) {
    this.provoked = true;
    if (this.state === 'stalk') return;
    this.respawnReadableFrom(playerPos);
    this.root.visible = true;
    this.body.setEnabled(true);
    this.state = 'haunt';
    this.vanishT = 0;
    this.touchCooldown = 0;
    this.caughtCooldown = 1.25;
    this.telegraphT = 1.25;
    this.face(playerPos);
    this.sfx.deskScrape(this.root.position.x, this.school.bounds.floorY + 0.6, this.root.position.z, 0.82);
    this.school.hauntDoor();
    this.school.setApparitionThreat(true, 0.32);
  }

  /** 단서를 찾는 동안에도 멀리서 모습을 보인다. 이 단계의 접촉은 사망이 아니라 경고다. */
  beginHaunt(progress: number, playerPos: THREE.Vector3) {
    this.clueProgress = Math.max(this.clueProgress, progress);
    if (this.clueProgress < 2 || this.state === 'stalk') return;
    if (this.state === 'dormant') {
      this.respawnReadableFrom(playerPos);
      this.root.visible = true;
      this.body.setEnabled(true);
      this.state = 'haunt';
      this.vanishT = 0;
      this.touchCooldown = 0;
      this.caughtCooldown = 2.2;
      this.telegraphT = 2.2;
      this.face(playerPos);
      this.sfx.deskScrape(this.root.position.x, this.school.bounds.floorY + 0.6, this.root.position.z, 0.55);
      this.school.hauntDoor();
    }
    this.school.setApparitionThreat(true, 0.12 + this.clueProgress * 0.08);
  }

  /** 방송으로 이름을 불러 주면 획득 직후 잠깐 공격하지 못한다. */
  acknowledgeName() {
    this.named = true;
    if (this.state === 'haunt') {
      this.root.visible = false;
      this.body.setEnabled(false);
      this.state = 'dormant';
      this.vanishT = 0;
      this.sfx.yuriHumStop(0.4);
      this.school.setFlicker(0);
      this.school.setApparitionThreat(false);
    }
  }

  /** 머리빗을 집었다 — 플레이어에게서 가장 먼 구석에서 눈을 뜬다 */
  activate(playerPos: THREE.Vector3) {
    if (this.state === 'stalk') return;
    this.respawnReadableFrom(playerPos);
    this.root.visible = true;
    this.body.setEnabled(true);
    this.state = 'stalk';
    this.vanishT = 0;
    this.touchCooldown = 0;
    // 침묵하고 이름을 돌려준 플레이어는 가장 긴 탈출 여유를 얻는다. 가짜 출석에 답했으면
    // 이름을 불러 줬더라도 이미 붙잡힌 목소리가 남아 있어 예고 시간이 짧다.
    this.caughtCooldown = this.named ? (this.provoked ? 3.4 : 5.2) : (this.provoked ? 2.4 : 3.0);
    this.telegraphT = this.caughtCooldown;
    this.face(playerPos);
    this.sfx.deskScrape(this.root.position.x, this.school.bounds.floorY + 0.6, this.root.position.z, 0.72);
    this.school.hauntDoor();
    this.school.setApparitionThreat(true, 0.15);
  }

  deactivate() {
    this.root.visible = false;
    this.body.setEnabled(false);
    this.state = 'dormant';
    this.sfx.yuriHumStop(0.4);
    this.school.setFlicker(0);
    this.school.setApparitionThreat(false);
    this.telegraphT = 0;
    this.touchCooldown = 0;
    this.hiddenT = 0;
    this.hiddenResolved = false;
    this.vanishT = 0;
    this.vanishMoved = false;
  }

  /** 복도 미닫이문을 닫아 번 시간. 문 콜라이더에 막히며 이 시간 동안은 움직이지 못한다. */
  delayByDoor(seconds: number) {
    if (this.state === 'dormant') return;
    this.caughtCooldown = Math.max(this.caughtCooldown, seconds);
    this.telegraphT = Math.max(this.telegraphT, seconds);
    this.sfx.yuriHumStop(0.18);
  }

  /** 잡은 뒤 — 사라졌다가 먼 구석에서 다시 서 있다 */
  respawnFarFrom(p: THREE.Vector3) {
    let best = this.school.spawns[0]!;
    let bd = -1;
    for (const sp of this.school.spawns) {
      const d = sp.distanceTo(p);
      if (d > bd) { bd = d; best = sp; }
    }
    this.placeAt(best);
  }

  /** 첫 출현은 가능하면 플레이어와 같은 시야선의 5~11 m 지점을 고른다. 벽 너머 최고거리 스폰은 재출현용이다. */
  private respawnReadableFrom(p: THREE.Vector3) {
    const eye = this.tmpV.set(p.x, this.school.bounds.floorY + 1.35, p.z);
    let best: THREE.Vector3 | null = null;
    let score = -Infinity;
    for (const sp of this.school.spawns) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d < 5 || d > 11.5) continue;
      this.tmpV2.set(sp.x, this.school.bounds.floorY + this.opts.height * 0.8, sp.z);
      if (this.physics.rayBlocked(eye, this.tmpV2, undefined, this.body)) continue;
      // 멀되 8 m 부근을 선호한다. 돌아봤을 때 전신과 주변 퇴로가 같이 들어오는 거리다.
      const s = 10 - Math.abs(d - 8);
      if (s > score) { score = s; best = sp; }
    }
    if (best) this.placeAt(best);
    else this.respawnFarFrom(p);
  }

  private placeAt(p: THREE.Vector3) {
    this.root.position.copy(p);
    this.root.position.y = this.school.bounds.floorY;
    this.syncBodyNow();
  }

  private syncBodyNow() {
    this.body.setTranslation({
      x: this.root.position.x,
      y: this.school.bounds.floorY + this.opts.height * 0.5 + 0.03,
      z: this.root.position.z,
    }, true);
  }

  private face(player: THREE.Vector3) {
    this.heading = Math.atan2(player.x - this.root.position.x, player.z - this.root.position.z);
    this.root.rotation.y = this.heading;
  }

  /**
   * 시선·이동·예고 상태와 무관한 몸 접촉 판정.
   * `caughtCooldown`은 유리가 움직이지 못하는 시간일 뿐, 미오가 직접 몸을 대는 것까지 무효화하지 않는다.
   */
  private tryTouch(player: THREE.Vector3, distance: number) {
    // 빗을 주운 뒤(stalk)는 손을 뻗는 거리까지 포함한다. 모델끼리 완전히 겹친 뒤 발동하던
    // 0.95 m보다 30 cm 넓혀, 팔·치맛자락이 닿아 보이는 순간 바로 잡힌다.
    const radius = this.state === 'haunt' ? 1.08 : 1.25;
    if (distance >= radius || this.touchCooldown > 0) return false;

    this.touchCooldown = this.state === 'haunt' ? this.vanishDuration + 0.35 : 2.0;
    if (this.state === 'haunt') {
      // 빗 획득 전에는 공격하지 않는다. 원래 자리에서 짧게 점멸한 뒤 사라지고,
      // 완전히 안 보이는 동안에만 먼 교실로 옮긴다.
      this.sfx.nopperaVanish();
      this.sfx.yuriHumStop(0.08);
      this.vanishT = this.vanishDuration;
      this.vanishMoved = false;
      this.body.setEnabled(false);
      this.caughtCooldown = Math.max(this.caughtCooldown, this.vanishDuration + 0.7);
      this.school.setFlicker(0.92);
    } else {
      this.caughtCooldown = 2.0;
      this.onCatch?.();
    }
    return true;
  }

  /** 같은 현재 위치에서 특정 방향의 물리 이동 가능량만 계산한다. */
  private probeMove(dirX: number, dirZ: number, distance: number, out: THREE.Vector3) {
    this.moveDesired.x = dirX * distance;
    this.moveDesired.y = 0;
    this.moveDesired.z = dirZ * distance;
    this.mover.computeColliderMovement(this.collider, this.moveDesired);
    const moved = this.mover.computedMovement();
    out.set(moved.x, 0, moved.z);
  }

  /** 직접 이동이 벽·가구에 막히면 좌우 67.5° 후보 중 더 멀리 진행되는 쪽으로 슬라이드한다. */
  private moveCollisionSafe(dirX: number, dirZ: number, distance: number) {
    this.probeMove(dirX, dirZ, distance, this.moveDirect);
    let chosen = this.moveDirect;
    if (this.moveDirect.lengthSq() < distance * distance * 0.56) {
      const c = 0.3826834324; // cos 67.5°
      const s = 0.9238795325; // sin 67.5°
      const first = this.avoidSide;
      const fx = dirX * c - dirZ * s * first;
      const fz = dirX * s * first + dirZ * c;
      const sx = dirX * c + dirZ * s * first;
      const sz = -dirX * s * first + dirZ * c;
      this.probeMove(fx, fz, distance, this.moveLeft);
      this.probeMove(sx, sz, distance, this.moveRight);
      const score = (v: THREE.Vector3) => v.length() + (v.x * dirX + v.z * dirZ) * 0.35;
      const directScore = score(this.moveDirect);
      const leftScore = score(this.moveLeft);
      const rightScore = score(this.moveRight);
      if (leftScore > directScore && leftScore >= rightScore) {
        chosen = this.moveLeft;
        this.avoidSide = first;
      } else if (rightScore > directScore) {
        chosen = this.moveRight;
        this.avoidSide = first === 1 ? -1 : 1;
      }
    }

    const tr = this.body.translation();
    const b = this.school.bounds;
    const nx = THREE.MathUtils.clamp(tr.x + chosen.x, b.minX, b.maxX);
    const nz = THREE.MathUtils.clamp(tr.z + chosen.z, b.minZ, b.maxZ);
    const cy = b.floorY + this.opts.height * 0.5 + 0.03;
    this.body.setNextKinematicTranslation({ x: nx, y: cy, z: nz });
    this.root.position.set(nx, b.floorY, nz);
  }

  /** @param excludeBody 플레이어 리지드바디 — 시야 레이가 **자기 캡슐에 막히면 안 된다**
   *  (카메라→그녀 레이는 3인칭에서 항상 내 몸을 관통한다. 실측: 이 제외가 없으면 영영 안 언다) */
  update(dt: number, player: THREE.Vector3, camera: THREE.PerspectiveCamera, excludeBody?: RAPIER.RigidBody, hidden = false) {
    if (this.state === 'dormant' || !this.model) return;
    const pd = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
    this.touchCooldown = Math.max(0, this.touchCooldown - dt);

    // 빗 획득 전 접촉 소멸: 0.18초간 형광등과 함께 끊겨 보인 뒤 1.27초 동안 완전히 사라진다.
    // 재배치는 안 보이는 구간에 단 한 번만 하고, 다시 나타날 때 물리 몸도 같은 위치에서 켠다.
    if (this.vanishT > 0) {
      this.vanishT = Math.max(0, this.vanishT - dt);
      this.caughtCooldown = Math.max(0, this.caughtCooldown - dt);
      const elapsed = this.vanishDuration - this.vanishT;
      if (elapsed < 0.18) {
        this.root.visible = Math.floor(elapsed / 0.035) % 2 === 0;
      } else {
        this.root.visible = false;
        if (!this.vanishMoved) {
          this.respawnFarFrom(player);
          this.vanishMoved = true;
        }
      }
      const pulse = THREE.MathUtils.clamp(this.vanishT / this.vanishDuration, 0.12, 1);
      this.school.setFlicker(0.24 + pulse * 0.68);
      this.school.setApparitionThreat(true, pulse * 0.32);
      if (this.vanishT <= 0) {
        this.root.visible = true;
        this.body.setEnabled(true);
        this.face(player);
        this.sfx.deskScrape(this.root.position.x, this.school.bounds.floorY + 0.6, this.root.position.z, 0.28);
      }
      return;
    }

    // 바라봐서 얼어 있거나 첫 출현 예고 중이어도 몸은 이미 그 자리에 있다.
    // 이동 로직보다 먼저 검사해야 플레이어가 정면에서 걸어 들어갔을 때 접촉이 빠지지 않는다.
    if (this.tryTouch(player, pd)) return;

    // 준비실 벽장. 유리가 코앞까지 온 뒤 들어가면 손이 먼저 닿고, 시선을 끊고 들어갔다면
    // 0.9초 뒤 먼 교실로 물러난다. 숨자마자 순간이동시키지 않아 문밖의 흥얼거림이 한 번 남는다.
    if (hidden) {
      this.hiddenT += dt;
      if (this.hiddenT >= 0.9 && !this.hiddenResolved) {
        this.hiddenResolved = true;
        this.respawnFarFrom(player);
        this.caughtCooldown = Math.max(this.caughtCooldown, 2.2);
        this.sfx.yuriHumStop(0.35);
      }
      this.school.setFlicker(0.08);
      this.school.setApparitionThreat(true, 0.04);
      return;
    }
    this.hiddenT = 0;
    this.hiddenResolved = false;

    if (this.caughtCooldown > 0) {
      this.caughtCooldown -= dt;
      this.sfx.yuriHumStop();
      this.telegraphT = Math.max(0, this.telegraphT - dt);
      const pulse = 0.34 + 0.18 * Math.sin(this.telegraphT * 9) ** 2;
      this.school.setFlicker(pulse);
      this.school.setApparitionThreat(true, pulse);
      return;
    }

    const head = this.tmpV.copy(this.root.position);
    head.y += this.opts.height * 0.88;

    // ---- 「본다」 판정 ----
    const toHer = this.tmpV2.copy(head).sub(camera.position);
    const dist = toHer.length();
    toHer.normalize();
    camera.getWorldDirection(this.camDir);
    // aspect 가 오염될 수 있다(창 폭 0 인 순간의 리사이즈 → NaN). NaN 비교는 조용히 false 라
    // 「영영 안 어는」 버그가 된다(실측 — 숨긴 패널에서 cosHalf 가 NaN 이었다)
    const asp = Number.isFinite(camera.aspect) && camera.aspect > 0.1 ? camera.aspect : 16 / 9;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5 * asp ** 0.5 + 0.12;
    const inView = this.camDir.dot(toHer) > Math.cos(halfFov);
    let visible = false;
    if (inView && dist < 12) {
      // 카메라 → 머리. rayBlocked 는 시작·끝 5 cm 여유를 알아서 준다(자기 몸/근처 소품 무시)
      this.tmpV2.copy(head).sub(camera.position).multiplyScalar((dist - 0.4) / dist).add(camera.position);
      visible = !this.physics.rayBlocked(camera.position, this.tmpV2, excludeBody, this.body);
    }
    // 어는 순간에만 노래를 접는다 — 매 프레임 부르면 페이드가 계속 재시작돼 영영 안 꺼진다
    if (visible && !this.frozen) { this.sfx.yuriHumStop(); this.humT = Math.max(this.humT, 1.4); }
    this.frozen = visible;

    if (!visible) {
      // ---- 접근 — 무음. 멀면 빠르고(어둠 속에서 성큼), 가까우면 스미듯 ----
      const fullSpeed = THREE.MathUtils.clamp(0.5 + (pd - 1.5) * 0.55, 0.5, 2.6);
      const hauntScale = 0.28 + this.clueProgress * 0.11;
      const speed = fullSpeed * (this.state === 'haunt' ? hauntScale : 1) * (this.provoked ? 1.22 : 1);
      const dirx = (player.x - this.root.position.x) / Math.max(0.001, pd);
      const dirz = (player.z - this.root.position.z) / Math.max(0.001, pd);
      this.moveCollisionSafe(dirx, dirz, speed * dt);
      // 몸은 항상 플레이어를 향해 서 있다 — 돌아봤을 때 이미 이쪽을 보고 있어야 한다
      this.heading = dampAngle(this.heading, Math.atan2(dirx, dirz), 8, dt);
      this.root.rotation.y = this.heading;

      // 책상 긁는 소리 — 이동 중 불규칙 간격, 그녀 위치에서
      this.scrapeT -= dt;
      if (this.scrapeT <= 0) {
        this.scrapeT = 1.2 + Math.random() * 1.6;
        this.sfx.deskScrape(this.root.position.x, this.school.bounds.floorY + 0.6, this.root.position.z);
      }

      // 흥얼거림 — 몇 마디 하다 멈추고, 한참 있다 다시. 간격이 규칙적이면 배경음악이 된다.
      // 입 높이(키 1.30 m 의 1.05 m)에서 내야 위치가 읽힌다
      this.humT -= dt;
      if (this.humT <= 0) {
        this.humT = 2.8 + Math.random() * 3.6;
        this.sfx.yuriHum(this.root.position.x, this.school.bounds.floorY + 1.05, this.root.position.z,
          this.state === 'haunt' ? 0.34 : 0.5); // haunt 단계는 아직 경고라 더 멀게 들린다
      }

      // 이번 프레임에 유리가 접촉 반경 안으로 들어온 경우도 즉시 처리한다.
      const movedDistance = Math.hypot(player.x - this.root.position.x, player.z - this.root.position.z);
      if (this.tryTouch(player, movedDistance)) return;
    }

    // ---- 형광등 = 접근 신호 (보이든 안 보이든 가까우면 떤다 — 등은 그녀를 안다) ----
    const proximity = THREE.MathUtils.clamp(1 - pd / 11, 0, 1) * (this.state === 'haunt' ? 0.45 : 1);
    this.school.setFlicker(proximity);
    this.school.setApparitionThreat(true, proximity);
  }
}
