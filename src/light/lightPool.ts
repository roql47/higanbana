import * as THREE from 'three';

/**
 * 점광원 풀 — **픽셀당 조명 비용의 상한**을 정한다 (2026-08-23).
 *
 * ## 왜 필요했나
 * `MeshStandardMaterial` 은 픽셀마다 **켜져 있는 모든 점광원을 순회**한다. 이 마을은 마츠리 초롱·
 * 처마 등불·지장 석등·사당 촛불에 더해 **강도 0.001 로 상주하던 공물 표식 8개**까지 합쳐
 * 36개가 켜져 있었고, 화면을 덮는 지형과 숲이 그 36회를 전 픽셀에서 치르고 있었다.
 *
 * 실측(높음+100 %, 1440×900): **36개 → 12.9 fps · 16개 → 35.6 fps · 8개 → 60.2 fps**.
 * 삼나무 700그루를 통째로 지워도 18.9 fps 였던 것과 비교하면, 이쪽이 압도적인 병목이었다.
 *
 * ## 왜 그냥 끄면 안 되는가
 * three 는 **보이는** 라이트만 세고, 그 수가 바뀌면 `NUM_POINT_LIGHTS` 가 달라져 **씬의 재질이
 * 전부 셰이더 재컴파일**된다(이 프로젝트 실측 한 프레임 8561 ms). 그래서 기존 코드가 표식을
 * 0.001 로 켜 둔 것이고 — 재컴파일은 막았지만 픽셀 비용은 그대로 냈다.
 *
 * ## 해법: 개수를 고정한 채 **내용만 갈아 끼운다**
 * 원본 라이트는 초기화 때 한 번 `visible = false` 로 내리고(로딩 중 재컴파일 1회), 대신 예산만큼의
 * **슬롯 라이트**를 만들어 상주시킨다. 매 프레임 카메라에서 가까운 순으로 활성 원본을 골라
 * 슬롯에 위치·색·강도를 복사한다. 켜진 개수는 **항상 예산과 같아서** 재컴파일이 다시는 없다.
 *
 * 원본 객체는 그대로 두므로 **소유 모듈(rules·pedestals·school…)의 코드는 손대지 않는다** —
 * 걔들이 `intensity` 를 올리면 다음 프레임에 풀이 알아서 집어 든다.
 *
 * 예산 밖의 등불은 빛을 잃지만 **종이 자체가 발광 재질**이라 여전히 빛나 보인다 — 밤·안개에서
 * 먼 등불에 필요한 건 바닥을 물들이는 빛이 아니라 「저기 불이 있다」는 점 하나다.
 */
export class LightPool {
  /** 무대에서 내린 원본들 — 소유 모듈이 계속 들고 흔든다 */
  private sources: THREE.PointLight[] = [];
  /** 실제로 씬에 켜져 있는 라이트. 개수 불변 */
  private slots: THREE.PointLight[] = [];
  private tmp = new THREE.Vector3();
  private lightSphere = new THREE.Sphere();
  private viewProjection = new THREE.Matrix4();
  private frustum = new THREE.Frustum();
  /** 재정렬 주기 — 매 프레임 36개를 정렬할 이유가 없다 */
  private t = 0;
  private scored: { src: THREE.PointLight; d2: number; pos: THREE.Vector3 }[] = [];
  private activeSlots = 0;
  private offscreenSources = 0;

  /**
   * @param budget 동시에 켤 점광원 수 (화질 프리셋에서 온다)
   * @param exclude 풀에 넣지 않을 라이트 — 플레이어 초칭·얼굴광처럼 **항상 곁에 있는 것**
   */
  constructor(private scene: THREE.Scene, private budget: number, exclude: (THREE.Light | null | undefined)[] = []) {
    const skip = new Set(exclude.filter(Boolean) as THREE.Light[]);
    scene.traverse((o) => {
      const l = o as THREE.PointLight;
      if (!l.isPointLight || skip.has(l)) return;
      // 그림자를 만드는 라이트는 건드리지 않는다 — 초칭처럼 연출의 주인공이다
      if (l.castShadow) return;
      this.sources.push(l);
    });
    for (const l of this.sources) l.visible = false;   // 로딩 중 1회 재컴파일
    for (let i = 0; i < budget; i++) {
      const s = new THREE.PointLight(0xffffff, 0, 8, 2);
      s.castShadow = false;
      s.name = `light-slot-${i}`;
      scene.add(s);
      this.slots.push(s);
    }
  }

  get sourceCount() { return this.sources.length; }
  get slotCount() { return this.slots.length; }

  /** 카메라(또는 플레이어) 기준으로 가까운 활성 광원을 슬롯에 싣는다 */
  update(dt: number, viewer: THREE.Vector3, camera?: THREE.Camera) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.12;   // 8 Hz — 등불은 정지물이고 플레이어는 초속 몇 미터다

    if (camera) {
      // renderer.render() 전에 실행되므로 이 프레임의 카메라 행렬을 여기서 확정한다.
      // 지난 프레임 행렬로 판정하면 빠른 회전 직후 가장자리 광원이 0.12초 늦게 들어올 수 있다.
      camera.updateMatrixWorld();
      this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
    }

    this.scored.length = 0;
    this.offscreenSources = 0;
    for (const src of this.sources) {
      if (src.intensity <= 0.01) continue;                 // 꺼져 있는 표식은 후보가 아니다
      src.getWorldPosition(this.tmp);
      const d2 = this.tmp.distanceToSquared(viewer);
      // 제 사거리 밖에서는 어차피 아무것도 못 비춘다 — 여유 1.5 배까지만 후보로
      const r = src.distance > 0 ? src.distance * 1.5 : 12;
      if (d2 > r * r) continue;
      // 광원 중심이 화면 밖이어도 빛의 구가 화면에 걸치면 남긴다. 구 전체가 프러스텀 밖인 경우만
      // 제외하므로 보이는 픽셀의 조명 결과는 변하지 않는다. 빈 슬롯은 intensity 0이 되고,
      // 셰이더 early-out이 해당 BRDF 계산을 통째로 건너뛴다.
      if (camera && src.distance > 0) {
        this.lightSphere.center.copy(this.tmp);
        this.lightSphere.radius = src.distance;
        if (!this.frustum.intersectsSphere(this.lightSphere)) { this.offscreenSources++; continue; }
      }
      this.scored.push({ src, d2, pos: this.tmp.clone() });
    }
    this.scored.sort((a, b) => a.d2 - b.d2);

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      const pick = this.scored[i];
      if (!pick) { slot.intensity = 0; continue; }
      slot.position.copy(pick.pos);
      slot.color.copy(pick.src.color);
      slot.intensity = pick.src.intensity;
      slot.distance = pick.src.distance;
      slot.decay = pick.src.decay;
    }
    this.activeSlots = Math.min(this.slots.length, this.scored.length);
  }

  /** DEV HUD용 — 실제 셰이딩에 기여하는 슬롯과 화면 밖에서 제거한 광원 수. */
  debugLine() { return `lights ${this.activeSlots}/${this.slots.length} · culled ${this.offscreenSources}`; }

  /** 화질 변경 시 예산 재적용 — 슬롯 수가 바뀌므로 **여기서만** 재컴파일이 난다 */
  setBudget(n: number) {
    if (n === this.slots.length) return;
    while (this.slots.length > n) { const s = this.slots.pop()!; s.removeFromParent(); }
    while (this.slots.length < n) {
      const s = new THREE.PointLight(0xffffff, 0, 8, 2);
      s.castShadow = false;
      s.name = `light-slot-${this.slots.length}`;
      this.scene.add(s);
      this.slots.push(s);
    }
    this.budget = n;
  }
}
