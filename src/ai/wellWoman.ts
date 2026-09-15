import * as THREE from 'three';
import { damp } from '@/core/math';
import type { Sfx } from '@/audio/sfx';
import type { WellShaft } from '@/world/higasato/wellShaft';
import { Props } from '@/world/props';

/**
 * 우물의 여자 — 공동우물 바닥의 원혼 (ACT 10~11, PLAN-STORY §5.3.3)
 *
 * 이 보스의 감각은 세 번째다: 로쿠로쿠비 = 청각, 유리 = 시각, 그녀는 **물소리**.
 * 그녀의 위치는 눈이 아니라 귀로 읽는다 — 첨벙·물방울 반향이 유일한 단서고,
 * **물소리가 잦아들 때(잠김)만** 밧줄을 오를 수 있다(§5.3.3 파훼 ③).
 *
 * ## 모습
 * 젖은 기모노 스킨 모델과 상승·얼굴 확인·포획 클립을 사용한다.
 * 연출 중에도 포즈와 파문은 갱신하고 추격·포획 시계만 멈춘다.
 *
 * ## 상태
 * dormant → [동전 픽업] risen(일어섬 — 첨벙, 접근) ⇄ submerged(잠김 — 그림자 유영, 무해)
 * 주기 교대. **동전을 들고 있으면 risen 이 길고 빠르다** — 그녀가 원하는 건 그 동전이 아니라,
 * 동전을 가져간 「아이」다.
 *
 * ## 잡히면 (§5.3.3) — 처리는 main 이
 * 얼굴을 확인하고 「너는 아니야」 — 1회째는 방 반대편으로 던져버림(낙하 리셋),
 * **2회째부터 즉사** → 우물가 체크포인트. onCatch(n) 의 n 이 회차다.
 */

export type WellWomanState = 'dormant' | 'submerged' | 'risen';
export type WellFirstAnswer = 'death' | 'voice' | 'silence' | 'truth';

export class WellWoman {
  readonly root = new THREE.Group();
  /** 로딩 화면의 셰이더 프리워밍 전에 실물과 애니메이션을 준비한다. 실패해도 절차 폴백으로 resolve. */
  readonly ready: Promise<void>;
  state: WellWomanState = 'dormant';
  /** 잡혔다 — n = 회차 (1 = 던져버림, 2+ = 즉사). 처리는 main 이 */
  onCatch: ((n: number) => void) | null = null;
  catches = 0;

  private shadow: THREE.Mesh;
  private figure: THREE.Group;
  private figureMat: THREE.MeshStandardMaterial;
  private fallbackFigure: THREE.Object3D[] = [];
  private model: THREE.Object3D | null = null;
  private modelMaterials: THREE.Material[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private activeClip = '';
  /** 얼굴 확인·붙잡기 같은 의미 동작 동안 locomotion이 idle/wade로 덮어쓰지 못하게 한다. */
  private gestureT = 0;
  private ripples: THREE.Mesh[] = [];
  private pos = new THREE.Vector3();
  private stateT = 0;
  private phaseDur = 3;
  private riseK = 0;          // 0 잠김 ~ 1 완전히 일어섬
  private lapT = 0.8;
  private dripT = 2.0;
  private caughtCooldown = 0;
  /** 탈출 직전 아이 목소리를 쫓는 동안. 이때는 미오를 보지 않고 방 중앙을 향한다. */
  private childCallT = 0;
  private t = 0;
  /** 벽감 조사 수. 동전을 들기 전에는 수면 아래 그림자와 지정된 연출에서만 반응한다. */
  private ritualProgress = 0;
  private armed = false;
  /** 동전 획득 뒤 첫 상승 전에 물의 위치와 안전한 벽감을 읽게 하는 확정 유예. */
  private warningGrace = 0;
  /** 세 벽감을 이은 뒤의 첫 대답. 질문 중에는 얼굴을 확인할 뿐 공격하지 않는다. */
  private questioning = false;
  private firstAnswer: WellFirstAnswer | null = null;
  private pursuitMul = 1;
  /** 조약돌이 만든 가짜 물소리. 플레이어보다 이 좌표를 먼저 확인한다. */
  private decoy = new THREE.Vector3();
  private decoyT = 0;
  /** 목마와 진실을 마주한 한 박자. 가장 어려운 선택에도 서사적으로 보장되는 탈출 틈이다. */
  private truthStagger = 0;
  /** 짧은 카메라 연출 중에는 상태 애니메이션은 돌되 이동·주기 전환·재포획을 멈춘다. */
  private cinematicHold = false;
  private recognitionDelay = 0;

  constructor(private shaft: WellShaft, private sfx: Sfx) {
    const c = shaft.chamber;
    this.pos.set(c.cx, 0, c.cz);

    // 잠김 — 수면 바로 아래의 검은 그림자 (그녀가 「있다」는 것만 알린다)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0x020304, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    // 일어섬 — 검은 실루엣: 몸통 기둥 + 어깨 + 숙인 머리. 젖은 표면이라 아주 약한 반사
    // 젖은 표면 — 달빛 기둥을 받아 번들거려야 어둠에서 실루엣이 선다(순검정은 밤에 묻힌다, 실측).
    // 에미시브 미광은 「물에 잠겨 있던 것」의 냉광이다
    this.figureMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e14, roughness: 0.12, metalness: 0.75,
      emissive: new THREE.Color(0x0a1622), emissiveIntensity: 0.55,
      transparent: true, opacity: 0,
    });
    this.figure = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1.35, 10), this.figureMat);
    body.position.y = 0.675;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), this.figureMat);
    shoulders.scale.set(1.35, 0.6, 0.9); shoulders.position.y = 1.32;
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), this.figureMat);
    headM.scale.set(0.95, 1.2, 1.0); headM.position.set(0, 1.52, 0.09);   // 앞으로 숙인 머리
    headM.rotation.x = 0.5;
    // 긴 팔 둘 — 늘어져 수면에 닿을 듯
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.05, 8), this.figureMat);
      arm.position.set(sx * 0.3, 0.85, 0.05);
      arm.rotation.z = sx * 0.12;
      this.figure.add(arm);
      this.fallbackFigure.push(arm);
    }
    this.figure.add(body, shoulders, headM);
    this.fallbackFigure.push(body, shoulders, headM);
    this.root.add(this.figure);

    // 파문 링 3 — 일어설 때 퍼진다
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.46, 24),
        new THREE.MeshBasicMaterial({ color: 0x3d4b55, transparent: true, opacity: 0, depthWrite: false }),
      );
      r.rotation.x = -Math.PI / 2;
      this.ripples.push(r);
      this.root.add(r);
    }
    this.root.visible = false;
    this.ready = this.loadModel();
  }

  /**
   * 새 실물: 18본 스킨 + idle/rise/submerged/wade 네 클립.
   * 한 메시·한 재질이라 절차 실루엣보다 디테일은 크게 늘어도 기본 드로우콜은 한 번이다.
   */
  private async loadModel() {
    try {
      const gltf = await Props.loader().loadAsync('/models/yokai-well-woman.glb');
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 1.68 / Math.max(0.01, size.y);
      model.scale.setScalar(scale);
      // 발바닥을 figure 원점에 놓고, 모델의 XZ 오프셋을 제거한다. 정면 +Z는 엔진 회전 계약과 같다.
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      model.name = 'well-woman-model';
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;    // 좁은 방에서 달 그림자 패스에 9.4만 tris를 재제출하지 않는다
        mesh.receiveShadow = true;
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = source.map((material) => {
          const copy = material.clone();
          copy.transparent = true;
          copy.opacity = 0;
          copy.depthWrite = true;
          const standard = copy as THREE.MeshStandardMaterial;
          if (standard.isMeshStandardMaterial) {
            // 흰 기모노도 물에 젖으면 하이라이트 폭이 좁아진다. 피부까지 금속처럼 만들지는 않는다.
            standard.roughness = Math.min(standard.roughness, 0.42);
            standard.metalness = Math.min(standard.metalness, 0.08);
            standard.envMapIntensity = 1.15;
          }
          this.modelMaterials.push(copy);
          return copy;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!;
      });
      this.figure.add(model);
      this.model = model;
      for (const object of this.fallbackFigure) object.visible = false;

      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.playClip(this.state === 'risen' ? 'rise' : 'submerged', 0);
      console.info(`[well-woman] model loaded · ${gltf.animations.map((clip) => clip.name).join(', ')}`);
    } catch (error) {
      console.warn('[well-woman] model load failed — procedural silhouette retained', error);
    }
  }

  private playClip(name: string, fade = 0.2) {
    if (!this.mixer || this.activeClip === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const previous = this.actions.get(this.activeClip);
    next.enabled = true;
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    if (['rise', 'face_check', 'grab', 'recognize'].includes(name)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (previous && fade > 0) previous.crossFadeTo(next, fade, false);
    else next.play();
    if (previous && fade > 0) next.play();
    this.activeClip = name;
  }

  private playGesture(name: 'cradle' | 'face_check' | 'grab' | 'rope_tug' | 'recognize', seconds: number) {
    this.gestureT = Math.max(this.gestureT, seconds);
    if (this.activeClip === name) {
      const action = this.actions.get(name);
      action?.reset().play();
    } else this.playClip(name, 0.16);
  }

  /**
   * 벽감 조사로 존재만 드러낸다. 동전 전에는 수면 아래 그림자만 남고,
   * 두 번째 벽감의 얼굴 확인과 세 번째 뒤의 질문은 main의 명시적 마이크로 컷만 사용한다.
   */
  awakenFromEvidence(progress: number, player?: THREE.Vector3) {
    const before = this.ritualProgress;
    this.ritualProgress = Math.max(this.ritualProgress, progress);
    const c = this.shaft.chamber;
    if (this.state === 'dormant') {
      this.pos.set(c.cx, 0, c.cz);
      this.catches = 0;
      this.caughtCooldown = 1.2;
      this.root.visible = true;
      this.setState('submerged');
    }
    if (before < 2 && this.ritualProgress >= 2) {
      this.placeAcrossFrom(player);
      this.setState('submerged');
      this.sfx.waterLap(this.pos.x, c.waterY, this.pos.z, 0.52);
    }
  }

  /** 동전을 집었다 — 등 뒤의 물이 일어선다 */
  activate(player?: THREE.Vector3) {
    if (this.state === 'risen' && this.armed) return;
    const c = this.shaft.chamber;
    if (this.state === 'dormant') this.pos.set(c.cx, 0, c.cz);
    this.catches = 0;
    this.placeAcrossFrom(player);
    this.caughtCooldown = 2.8;
    this.warningGrace = 0;
    this.armed = true;
    this.root.visible = true;
    this.setState('risen');
  }

  /**
   * 동전 획득 마이크로 컷의 시작. 동전을 든 바로 그 프레임에 실체를 솟게 하되,
   * 자막을 읽는 동안 접근·잡기가 진행되어 조작 복귀 전에 피격되는 일은 막는다.
   */
  beginPickupReveal(player?: THREE.Vector3) {
    this.activate(player);
    this.questioning = true;
    this.caughtCooldown = Math.max(this.caughtCooldown, 10);
    // 앞선 대답에서 수면 위에 남아 있었더라도, 동전 획득은 별도의 완전한 상승 동작으로 읽혀야 한다.
    this.riseK = Math.min(this.riseK, 0.08);
    const rise = this.actions.get('rise');
    if (rise) {
      rise.reset();
      rise.setLoop(THREE.LoopOnce, 1);
      rise.clampWhenFinished = true;
      rise.play();
      this.activeClip = 'rise';
    }
  }

  /** 동전 획득 자막이 끝나고 조작과 추격을 함께 돌려준다. */
  endPickupReveal() {
    this.questioning = false;
    this.caughtCooldown = Math.max(this.caughtCooldown, 0.85);
  }

  /** 카메라 숏이 얼굴·손의 행동을 보여 주는 동안 AI 판정만 정지한다. */
  holdForCinematic() {
    this.cinematicHold = true;
    this.caughtCooldown = Math.max(this.caughtCooldown, 12);
  }

  /** 등반의 마지막 매듭은 잠수 주기와 무관하게 밧줄을 잡는 실체를 보여 준다. */
  beginFinalKnot() {
    this.root.visible = true;
    this.setState('risen');
    this.holdForCinematic();
    this.playGesture('rope_tug', 5.3);
  }

  releaseFromCinematic(grace = 0.65) {
    this.cinematicHold = false;
    this.caughtCooldown = grace;
  }

  /** 두 번째 포획 숏에서 카메라와 함께 수면 아래로 내려간다. */
  sinkForCinematic() {
    this.cinematicHold = true;
    this.setState('submerged');
  }

  /** 카메라가 모델 로딩 여부와 무관하게 같은 얼굴 높이를 겨냥하게 한다. */
  cinematicFocus(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.shaft.chamber.waterY + 1.42, this.pos.z);
  }

  /** 세 흔적을 연결한 순간의 대면. 형체는 완전히 서지만 선택을 빼앗기 전에는 공격하지 않는다. */
  beginQuestion(player?: THREE.Vector3) {
    this.placeAcrossFrom(player);
    this.root.visible = true;
    this.questioning = true;
    this.caughtCooldown = Math.max(this.caughtCooldown, 8);
    this.warningGrace = 0;
    this.setState('risen');
    this.playGesture('cradle', 5.6);
  }

  /** 두 번째 벽감의 4~6초 마이크로 컷. 발목 곁에서 얼굴만 확인하고 공격 없이 물러난다. */
  beginRecognition(player: THREE.Vector3) {
    const c = this.shaft.chamber;
    let dx = c.cx - player.x, dz = c.cz - player.z;
    const d = Math.max(0.001, Math.hypot(dx, dz)); dx /= d; dz /= d;
    this.pos.set(player.x + dx * 0.72, 0, player.z + dz * 0.72);
    this.root.visible = true;
    this.questioning = true;
    this.warningGrace = 0;
    this.caughtCooldown = Math.max(this.caughtCooldown, 6);
    this.setState('risen');
    this.playGesture('face_check', 2.2);
    this.sfx.wellWetGrab(this.pos.x, this.shaft.chamber.waterY + 0.35, this.pos.z, 0.56);
  }

  endRecognition() {
    if (!this.questioning || this.firstAnswer) return;
    this.questioning = false;
    this.caughtCooldown = Math.max(this.caughtCooldown, 3.2);
    this.setState('submerged');
  }

  /** 첫 대답은 즉시 난이도와 ACT 25의 기억 입력으로 남는다. */
  resolveQuestion(answer: WellFirstAnswer) {
    this.questioning = false;
    this.restoreAnswer(answer);
    if (answer === 'death') {
      this.caughtCooldown = 1.4;
    } else if (answer === 'voice') {
      this.warningGrace = 4.2;
      this.caughtCooldown = 4.5;
    } else if (answer === 'truth') {
      this.truthStagger = 2.5;
      this.caughtCooldown = 3;
    } else {
      this.caughtCooldown = 2.4;
    }
    // 선택의 표정·몸짓은 직전 대화/컷에서 이미 보여 줬다. 동전을 건드리기 전에는 다시 잠긴다.
    this.setState('submerged');
  }

  /** 체크포인트 복원은 질문 장면을 재생하지 않고 이후 추격의 성격만 되살린다. */
  restoreAnswer(answer: WellFirstAnswer) {
    this.firstAnswer = answer;
    this.pursuitMul = answer === 'death' ? 1.2 : answer === 'voice' ? 0.88 : answer === 'truth' ? 1.32 : 1;
  }

  /** 조약돌 착수음으로 방향을 돌린다. risen 상태에서도 시선과 이동 목표가 실제 물소리를 따른다. */
  distractAt(position: THREE.Vector3, seconds = 3.1) {
    this.decoy.copy(position);
    this.decoyT = Math.max(this.decoyT, seconds);
    this.caughtCooldown = Math.max(this.caughtCooldown, 0.75);
    // 조사 단계의 조약돌은 물속 그림자만 끌어당긴다. 수면 위 상승은 동전 획득 뒤에만 허용한다.
    if (this.armed && this.state === 'submerged') this.setState('risen');
  }

  /** 마지막 선택의 목마. 공격을 없애지 않고, 손이 멈추는 단 한 박자만 보장한다. */
  confrontWithToy(seconds = 2.8) {
    this.truthStagger = Math.max(this.truthStagger, seconds);
    this.caughtCooldown = Math.max(this.caughtCooldown, seconds);
    this.setState('risen');
    this.playGesture('rope_tug', Math.min(1.3, seconds));
    this.recognitionDelay = 1.1;
  }

  deactivate() {
    this.root.visible = false;
    this.state = 'dormant';
    this.childCallT = 0;
    this.armed = false;
    this.warningGrace = 0;
    this.questioning = false;
    this.decoyT = 0;
    this.truthStagger = 0;
    this.gestureT = 0;
    this.cinematicHold = false;
    this.recognitionDelay = 0;
    this.playClip('submerged', 0.15);
  }

  /** 지금 밧줄을 오르면 안전한가 — 동전 전에는 연출 상태와 무관하게 포획하지 않는다. */
  get safeToClimb() {
    return !this.armed || this.state !== 'risen' || this.childCallT > 0 || this.decoyT > 0 || this.truthStagger > 0;
  }

  /**
   * ACT 10 결말. 아래에서 들린 「엄마, 같이 가」에 반응해 미오에게서 등을 돌린다.
   * 공격을 끄는 별도 상태로 분기해, 단순히 모델을 감추는 대신 여자가 실제 목소리 쪽으로 이동한다.
   */
  lureToChildVoice(seconds = 3.2) {
    if (this.state === 'dormant') return;
    this.childCallT = Math.max(this.childCallT, seconds);
    this.caughtCooldown = Math.max(this.caughtCooldown, seconds);
    this.setState('risen');
    this.playGesture('cradle', seconds);
  }

  private setState(s: WellWomanState) {
    this.state = s;
    this.stateT = 0;
    if (s === 'risen') {
      this.playClip('rise', 0.18);
      this.phaseDur = 3.2 + Math.random() * 1.8;
      const c = this.shaft.chamber;
      this.sfx.waterRise(this.pos.x, c.waterY, this.pos.z);
      for (const r of this.ripples) { r.scale.setScalar(1); (r.material as THREE.MeshBasicMaterial).opacity = 0.5; }
    } else if (s === 'submerged') {
      this.playClip('submerged', 0.28);
      this.phaseDur = 3.6 + Math.random() * 2.6;
      const c = this.shaft.chamber;
      this.sfx.waterRise(this.pos.x, c.waterY, this.pos.z, 0.4);   // 잠기는 첨벙 — 작게
    }
  }

  /** 플레이어 반대편 수면에서 올라와 첫 프레임 접촉을 막고, 위치를 소리로 읽게 한다. */
  private placeAcrossFrom(player?: THREE.Vector3) {
    if (!player) return;
    const c = this.shaft.chamber;
    let dx = c.cx - player.x, dz = c.cz - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = 1; dz = 0; }
    else { dx /= d; dz /= d; }
    const r = Math.max(1.4, c.r - 1.0);
    this.pos.set(c.cx + dx * r, 0, c.cz + dz * r);
  }

  /** @param carryingCoins 동전 소지 — risen 이 길고 빠르다 */
  update(dt: number, player: THREE.Vector3, carryingCoins: boolean, pauseAI = false) {
    if (this.state === 'dormant') return;
    const held = pauseAI || this.cinematicHold;
    const aiDt = held ? 0 : dt;
    this.t += dt;
    this.stateT += aiDt;
    if (this.caughtCooldown > 0) this.caughtCooldown -= aiDt;
    if (this.childCallT > 0) this.childCallT = Math.max(0, this.childCallT - aiDt);
    if (this.decoyT > 0) this.decoyT = Math.max(0, this.decoyT - aiDt);
    if (this.truthStagger > 0) this.truthStagger = Math.max(0, this.truthStagger - aiDt);
    if (this.gestureT > 0) this.gestureT = Math.max(0, this.gestureT - dt);
    if (this.recognitionDelay > 0) {
      this.recognitionDelay = Math.max(0, this.recognitionDelay - dt);
      if (this.recognitionDelay === 0) this.playGesture('recognize', Math.max(1.4, this.truthStagger));
    }
    const c = this.shaft.chamber;

    if (this.warningGrace > 0) {
      this.warningGrace = Math.max(0, this.warningGrace - aiDt);
    }

    // ---- 주기 교대 ----
    const dur = this.state === 'risen' && carryingCoins ? this.phaseDur * 1.5 : this.phaseDur;
    if (!this.questioning && !held && this.warningGrace <= 0 && this.childCallT <= 0
      && this.decoyT <= 0 && this.truthStagger <= 0 && this.stateT > dur) {
      this.setState(this.state === 'risen' ? 'submerged' : this.armed ? 'risen' : 'submerged');
    }

    const playerInside = this.shaft.inChamber(player);
    const inNiche = this.shaft.inNiche(player);

    // ---- 이동 ----
    const dx = player.x - this.pos.x, dz = player.z - this.pos.z;
    const pd = Math.hypot(dx, dz);
    if (held) {
      // 연출 중 배우의 위치를 고정하고 포즈만 재생한다.
    } else if (this.childCallT > 0) {
      // 목소리는 방 중앙의 물속에서 난다. 미오에게서 멀어져 그 자리로 몸을 돌린다.
      const tx = c.cx, tz = c.cz;
      const cdx = tx - this.pos.x, cdz = tz - this.pos.z;
      const cd = Math.max(0.001, Math.hypot(cdx, cdz));
      this.pos.x += (cdx / cd) * Math.min(cd, 0.72 * dt);
      this.pos.z += (cdz / cd) * Math.min(cd, 0.72 * dt);
    } else if (this.decoyT > 0) {
      const ddx = this.decoy.x - this.pos.x, ddz = this.decoy.z - this.pos.z;
      const dd = Math.max(0.001, Math.hypot(ddx, ddz));
      this.pos.x += (ddx / dd) * Math.min(dd, 1.28 * dt);
      this.pos.z += (ddz / dd) * Math.min(dd, 1.28 * dt);
    } else if (this.armed && !this.questioning && !held && this.truthStagger <= 0
      && this.state === 'risen' && playerInside && !inNiche) {
      // 일어서서 걸어온다 — 물을 가르는 속도. 동전을 들었으면 빠르다
      const spd = (carryingCoins ? 1.35 : 0.95) * this.pursuitMul;
      if (pd > 0.01) {
        const step = Math.min(pd, spd * dt);
        this.pos.x += (dx / pd) * step;
        this.pos.z += (dz / pd) * step;
      }
    } else if (this.state === 'submerged') {
      // 그림자가 중심으로 흘러 돌아간다 — 다음에 어디서 일어설지 모르게
      this.pos.x = damp(this.pos.x, c.cx + Math.sin(this.t * 0.4) * 1.2, 0.8, dt);
      this.pos.z = damp(this.pos.z, c.cz + Math.cos(this.t * 0.31) * 1.2, 0.8, dt);
    }
    const movingAboveWater = !held && this.state === 'risen'
      && (this.childCallT > 0 || this.decoyT > 0
        || (this.armed && !this.questioning && this.truthStagger <= 0 && playerInside && !inNiche && pd > 0.12));
    const rising = this.activeClip === 'rise' && (this.actions.get('rise')?.isRunning() ?? this.riseK < 0.95);
    if (this.state === 'risen' && !rising && this.gestureT <= 0) this.playClip(movingAboveWater ? 'wade' : 'idle', 0.24);
    else if (this.state === 'submerged') this.playClip('submerged', 0.24);
    this.mixer?.update(dt);
    // 방 안에 가둔다 (니치에는 못 들어온다 — 그녀는 물에서 못 나간다)
    const rd = Math.hypot(this.pos.x - c.cx, this.pos.z - c.cz);
    if (rd > c.r - 0.35) {
      this.pos.x = c.cx + (this.pos.x - c.cx) / rd * (c.r - 0.35);
      this.pos.z = c.cz + (this.pos.z - c.cz) / rd * (c.r - 0.35);
    }

    // ---- 물소리 = 위치 방송 (§5.3.3 「그녀의 위치 = 물소리」) ----
    this.lapT -= dt;
    if (this.lapT <= 0) {
      this.lapT = this.state === 'risen' ? 0.55 + Math.random() * 0.4 : 1.6 + Math.random() * 1.2;
      this.sfx.waterLap(this.pos.x, c.waterY, this.pos.z, this.state === 'risen' ? 0.6 : 0.22);
    }
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 2.5 + Math.random() * 3.5;
      this.sfx.wellDrip(c.cx + (Math.random() - 0.5) * 3, c.waterY + 2.5, c.cz + (Math.random() - 0.5) * 3);
    }

    // ---- 잡기 — risen 상태에서만. 니치 안은 안전 ----
    if (this.armed && !this.questioning && !held && this.childCallT <= 0
      && this.truthStagger <= 0 && this.state === 'risen'
      && playerInside && !inNiche && this.caughtCooldown <= 0 && pd < 0.8) {
      this.caughtCooldown = 2.5;
      this.catches += 1;
      this.playGesture('grab', 1.35);
      this.sfx.wellWetGrab(this.pos.x, c.waterY + 0.4, this.pos.z, this.catches >= 2 ? 1 : 0.76);
      if (this.catches >= 2) this.sfx.wellSubmerge(player.x, c.waterY, player.z, 1);
      this.onCatch?.(this.catches);
    }

    // ---- 비주얼 ----
    this.riseK = damp(this.riseK, this.state === 'risen' ? 1 : 0, 4.5, dt);
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.shadow.position.y = c.waterY + 0.012;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - this.riseK * 0.6);
    this.figure.position.y = c.waterY - 1.5 + this.riseK * 1.5;
    this.figureMat.opacity = this.riseK * 0.96;
    if (this.model) {
      this.model.visible = this.riseK > 0.012;
      for (const material of this.modelMaterials) {
        material.opacity = this.riseK * 0.98;
      }
    }
    // 몸이 물결에 아주 느리게 흔들린다 — 서 있는 게 아니라 떠 있는 것
    this.figure.rotation.z = 0.03 * Math.sin(this.t * 1.1);
    this.figure.rotation.x = 0.02 * Math.sin(this.t * 0.8 + 1.0);
    // 얼굴 없는 머리가 플레이어를 향한다
    if (this.childCallT > 0) this.figure.rotation.y = Math.atan2(c.cx - this.pos.x, c.cz - this.pos.z);
    else if (this.decoyT > 0) this.figure.rotation.y = Math.atan2(this.decoy.x - this.pos.x, this.decoy.z - this.pos.z);
    else if (playerInside) this.figure.rotation.y = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
    // 파문 확산
    for (let i = 0; i < this.ripples.length; i++) {
      const r = this.ripples[i]!;
      r.position.y = c.waterY + 0.008;
      const m = r.material as THREE.MeshBasicMaterial;
      if (m.opacity > 0.01) {
        r.scale.multiplyScalar(1 + dt * (0.9 + i * 0.25));
        m.opacity = Math.max(0, m.opacity - dt * 0.35);
      }
    }
  }
}
