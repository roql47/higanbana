import * as THREE from 'three';
import { Props } from '@/world/props';
import { settings } from '@/core/settings';
import { damp, clamp } from '@/core/math';
import type { VillageGround } from '@/world/village/ground';
import type { Senses } from './senses';
import type { Sfx } from '@/audio/sfx';

/**
 * 도로타보(泥田坊) — 논의 주인. 추격자가 아니라 **영역 규칙**이다.
 *
 * 논 은신(벼 사이 웅크림)은 시야를 끊는 강력한 수단이라 대가가 필요하다:
 *   논 안에서 **움직이면** 노출이 빠르게, **가만히 있으면** 천천히 쌓인다 →
 *   임계를 넘으면 플레이어 근처 진흙에서 솟아올라 울부짖는다.
 *   울음 = 반경 22 m 소음 이벤트 — **추격자들이 논으로 온다.** 이게 진짜 벌칙이다.
 *   솟은 채 플레이어에게 미끄러져 다가와 논 밖으로 밀어낸다 (즉사 아님).
 *   논 밖으로는 나올 수 없다. 플레이어가 논을 벗어나면 도로 가라앉는다.
 */
export type DorotaboState = 'HIDDEN' | 'RISING' | 'ACTIVE' | 'SINKING';

export class Dorotabo {
  readonly root = new THREE.Group();
  state: DorotaboState = 'HIDDEN';
  /** 노출 게이지 (임계 도달 시 출현) */
  exposure = 0;
  private cooldown = 0;
  private riseT = 0;
  private baseY = 0;
  private yaw = 0;
  private t = 0;
  private wailT = 0;
  private tmp = new THREE.Vector3();
  private modelH = 1.5;
  loaded = false;
  /** 플레이어를 밀어내는 속도(월드, main 이 컨트롤러에 더한다) */
  readonly pushVelocity = new THREE.Vector3();

  constructor(
    private ground: VillageGround,
    private senses: Senses,
    private sfx: Sfx,
    private opts: { url: string; height?: number },
  ) {
    this.modelH = opts.height ?? 1.6;
    this.root.visible = false;
    void this.load();
  }

  private async load() {
    const gltf = await Props.loader().loadAsync(this.opts.url);
    const inner = gltf.scene;
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = this.modelH / Math.max(0.01, size.y);
    inner.scale.setScalar(s);
    inner.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    const wrap = new THREE.Group();
    wrap.add(inner);
    wrap.rotation.y = -Math.PI / 2; // Tripo 정면 +X → +Z
    this.root.add(wrap);
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.shadowMeshes.push(m); }
    });
    this.loaded = true;
    console.info('[dorotabo] loaded', this.opts.url);
  }

  reset() {
    this.state = 'HIDDEN';
    this.exposure = 0;
    this.cooldown = 0;
    this.root.visible = false;
    this.pushVelocity.set(0, 0, 0);
  }

  private shadowMeshes: THREE.Mesh[] = [];
  private castingShadow = true;

  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number) {
    // 그림자 LOD: 초칭 사거리 밖이면 큐브맵 6면 렌더에서 제외 (frustumCulled=false 라 자동 컬링 안 됨)
    {
      const want = this.root.position.distanceTo(playerPos) < settings.chochin.rangeHigh + 4;
      if (want !== this.castingShadow) {
        this.castingShadow = want;
        for (const m of this.shadowMeshes) m.castShadow = want;
      }
    }
    if (!this.loaded) return;
    this.t += dt;
    this.pushVelocity.set(0, 0, 0);
    const d = settings.dorotabo;
    const inPaddy = this.ground.paddyMask(playerPos.x, playerPos.z) > 0.15;
    this.cooldown = Math.max(0, this.cooldown - dt);

    switch (this.state) {
      case 'HIDDEN': {
        if (inPaddy && this.cooldown <= 0) {
          // 움직이면 빠르게, 가만히 있으면 천천히 (벼 은신 자체는 허용하되 남용을 벌한다)
          this.exposure += dt * (playerSpeed > 0.3 ? d.exposeMoving : d.exposeStill);
          if (this.exposure >= d.threshold) this.rise(playerPos);
        } else {
          this.exposure = Math.max(0, this.exposure - dt * 0.6);
        }
        break;
      }
      case 'RISING': {
        this.riseT += dt;
        const k = clamp(this.riseT / d.riseTime, 0, 1);
        this.root.position.y = this.baseY - this.modelH * (1 - easeOut(k));
        this.root.rotation.y = this.yaw + Math.sin(this.t * 9) * 0.05 * (1 - k);
        if (k >= 1) { this.state = 'ACTIVE'; this.wailT = 0; }
        break;
      }
      case 'ACTIVE': {
        // 플레이어가 논을 떠났으면 가라앉는다
        if (!inPaddy) { this.state = 'SINKING'; this.riseT = 0; break; }
        // 미끄러져 접근 (논 안에서만)
        this.tmp.set(playerPos.x - this.root.position.x, 0, playerPos.z - this.root.position.z);
        const dist = this.tmp.length();
        if (dist > 0.8) {
          this.tmp.normalize();
          const nx = this.root.position.x + this.tmp.x * d.slideSpeed * dt;
          const nz = this.root.position.z + this.tmp.z * d.slideSpeed * dt;
          if (this.ground.paddyMask(nx, nz) > 0.1) {
            this.root.position.x = nx;
            this.root.position.z = nz;
          }
          this.yaw = Math.atan2(this.tmp.x, this.tmp.z);
        }
        this.root.rotation.y = this.yaw + Math.sin(this.t * 2.2) * 0.06;
        this.root.position.y = this.baseY + Math.sin(this.t * 1.7) * 0.04;
        // 밀어내기: 2.2 m 이내면 플레이어를 가장 가까운 논 밖으로 민다
        if (dist < d.pushRange) {
          const strength = d.pushSpeed * (1 - dist / d.pushRange);
          this.tmp.set(playerPos.x - this.root.position.x, 0, playerPos.z - this.root.position.z).normalize();
          this.pushVelocity.copy(this.tmp).multiplyScalar(strength);
        }
        // 주기적 울음 = 소음 (추격자를 부른다)
        this.wailT -= dt;
        if (this.wailT <= 0) {
          this.wailT = 3.2 + Math.random() * 1.4;
          this.senses.emitNoise(this.root.position, d.noiseRadius, 1.4);
          this.sfx.dorotaboWail();
        }
        break;
      }
      case 'SINKING': {
        this.riseT += dt;
        const k = clamp(this.riseT / (d.riseTime * 0.8), 0, 1);
        this.root.position.y = this.baseY - this.modelH * easeOut(k);
        if (k >= 1) {
          this.state = 'HIDDEN';
          this.root.visible = false;
          this.exposure = 0;
          this.cooldown = d.cooldown;
        }
        break;
      }
    }
  }

  /** 플레이어 근처 논 속에서 솟는다 */
  private rise(playerPos: THREE.Vector3) {
    // 플레이어 전방-측면 2.6 m 지점 중 논인 곳
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = playerPos.x + Math.sin(a) * 2.6;
      const z = playerPos.z + Math.cos(a) * 2.6;
      if (this.ground.paddyMask(x, z) > 0.3) {
        this.root.position.set(x, 0, z);
        this.baseY = this.ground.heightAt(x, z) + 0.05;
        this.root.position.y = this.baseY - this.modelH;
        this.yaw = Math.atan2(playerPos.x - x, playerPos.z - z);
        this.root.rotation.y = this.yaw;
        this.root.visible = true;
        this.state = 'RISING';
        this.riseT = 0;
        // 솟는 순간부터 소리 — 진흙 갈라지는 소음 + 첫 울음
        this.sfx.mudRise();
        this.senses.emitNoise(this.root.position, settings.dorotabo.noiseRadius, 1.4);
        return;
      }
    }
    // 논이 좁아 실패하면 노출 게이지만 절반으로
    this.exposure = settings.dorotabo.threshold * 0.5;
  }
}

function easeOut(t: number) { return 1 - (1 - t) * (1 - t) * (1 - t); }
