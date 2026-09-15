import * as THREE from 'three';
import type { CamKey, Sequence } from './sequencer';

/** ACT 10의 카메라는 새로운 정보를 보여 주는 짧은 숏만 쓴다. 이동·퍼즐·등반 자체는 빼앗지 않는다. */
export class WellCinematics {
  constructor(private chamber?: { cx: number; cz: number; r: number; floorY: number }) {}

  private indoors(sequence: Sequence): Sequence {
    sequence.cameraPath = 'bounded';
    const c = this.chamber;
    if (!c) return sequence;
    for (const key of sequence.cam ?? []) {
      const dx = key.pos[0] - c.cx, dz = key.pos[2] - c.cz;
      const distance = Math.hypot(dx, dz), radius = c.r - 0.65;
      if (distance > radius) {
        key.pos[0] = c.cx + dx / distance * radius;
        key.pos[2] = c.cz + dz / distance * radius;
      }
      // Submerge alone deliberately crosses the water/floor during its black fade.
      key.pos[1] = THREE.MathUtils.clamp(key.pos[1], c.floorY + (sequence.id === 'well-submerge' ? -0.5 : 0.7), c.floorY + 3.2);
    }
    return sequence;
  }
  private tuple(v: THREE.Vector3): [number, number, number] { return [v.x, v.y, v.z]; }

  private basis(from: THREE.Vector3, to: THREE.Vector3) {
    const forward = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    if (forward.lengthSq() < 1e-5) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { forward, right };
  }

  private key(t: number, pos: THREE.Vector3, look: THREE.Vector3, fov: number): CamKey {
    return { t, pos: this.tuple(pos), look: this.tuple(look), fov };
  }

  /** 두 번째 벽감 — 손가락보다 얼굴 확인이 먼저 읽히는 옆얼굴 숏. */
  faceCheck(player: THREE.Vector3, woman: THREE.Vector3): Sequence {
    const pHead = player.clone().add(new THREE.Vector3(0, 1.34, 0));
    const wHead = woman.clone();
    const middle = pHead.clone().lerp(wHead, 0.52);
    const { forward, right } = this.basis(woman, player);
    const p0 = middle.clone().addScaledVector(right, 1.48).addScaledVector(forward, -0.28).add(new THREE.Vector3(0, 0.18, 0));
    const p1 = middle.clone().addScaledVector(right, 1.02).addScaledVector(forward, 0.08).add(new THREE.Vector3(0, 0.02, 0));
    const p2 = middle.clone().addScaledVector(right, 1.28).addScaledVector(forward, -0.22).add(new THREE.Vector3(0, 0.12, 0));
    return this.indoors({
      id: 'well-face-check', duration: 5.7, skippable: true,
      cam: [
        this.key(0, p0, middle, 50),
        this.key(2.6, p1, pHead.clone().lerp(wHead, 0.6), 43),
        this.key(5.7, p2, wHead.clone().add(new THREE.Vector3(0, -0.08, 0)), 48),
      ],
    });
  }

  /** 세 벽감 뒤 첫 대면 — 보이지 않는 아이를 안은 팔과 미오 사이를 한 프레임에 둔다. */
  firstQuestion(player: THREE.Vector3, woman: THREE.Vector3): Sequence {
    const pHead = player.clone().add(new THREE.Vector3(0, 1.34, 0));
    const wChest = woman.clone().add(new THREE.Vector3(0, -0.22, 0));
    const middle = pHead.clone().lerp(wChest, 0.55);
    const { forward, right } = this.basis(player, woman);
    const wide = middle.clone().addScaledVector(right, -2.15).addScaledVector(forward, -0.48).add(new THREE.Vector3(0, 0.36, 0));
    const arms = wChest.clone().addScaledVector(right, -1.2).addScaledVector(forward, -0.2).add(new THREE.Vector3(0, 0.08, 0));
    const face = woman.clone().addScaledVector(right, -1.08).addScaledVector(forward, 0.08).add(new THREE.Vector3(0, 0.04, 0));
    return this.indoors({
      id: 'well-first-question', duration: 7.05, skippable: true,
      cam: [
        this.key(0, wide, middle, 52),
        this.key(3.1, arms, wChest, 46),
        this.key(7.05, face, woman, 43),
      ],
    });
  }

  /** 동전 획득 — 제단의 손높이에서 시작해 등 뒤에서 완전히 일어나는 여자로 시선을 넘긴다. */
  coinPickup(player: THREE.Vector3, altar: THREE.Vector3, woman: THREE.Vector3): Sequence {
    const hand = altar.clone().add(new THREE.Vector3(0, 0.18, 0));
    const wChest = woman.clone().add(new THREE.Vector3(0, -0.22, 0));
    const { forward, right } = this.basis(player, woman);
    const coinCam = hand.clone().addScaledVector(right, 0.72).addScaledVector(forward, -0.78).add(new THREE.Vector3(0, 0.44, 0));
    const turnCam = player.clone().addScaledVector(right, 1.1).addScaledVector(forward, -1.0).add(new THREE.Vector3(0, 1.25, 0));
    const threatCam = wChest.clone().addScaledVector(right, 1.5).addScaledVector(forward, -0.5).add(new THREE.Vector3(0, 0.22, 0));
    return this.indoors({
      id: 'well-coin-pickup', duration: 7.85, skippable: true,
      cam: [
        this.key(0, coinCam, hand, 47),
        this.key(2.35, coinCam.clone().add(new THREE.Vector3(0, 0.08, 0)), hand, 42),
        this.key(4.75, turnCam, wChest, 51),
        this.key(7.85, threatCam, woman, 45),
      ],
    });
  }

  /** 첫 접촉 — 얼굴과 동전 든 손을 확인한 뒤, 반대편 벽감으로 시선이 날아간다. */
  firstCapture(player: THREE.Vector3, woman: THREE.Vector3, throwTarget: THREE.Vector3, onThrown?: () => void): Sequence {
    const pHead = player.clone().add(new THREE.Vector3(0, 1.32, 0));
    const grip = pHead.clone().lerp(woman, 0.48);
    const { forward, right } = this.basis(woman, player);
    const close = grip.clone().addScaledVector(right, 0.86).addScaledVector(forward, -0.16).add(new THREE.Vector3(0, 0.04, 0));
    const hand = close.clone().addScaledVector(forward, 0.18);
    const thrown = throwTarget.clone().addScaledVector(right, -1.65).addScaledVector(forward, -0.75).add(new THREE.Vector3(0, 1.15, 0));
    const targetLook = throwTarget.clone().add(new THREE.Vector3(0, 0.75, 0));
    return this.indoors({
      id: 'well-first-capture', duration: 5.55, skippable: true,
      cam: [
        this.key(0, close, grip, 44),
        this.key(2.4, hand, pHead, 40),
        this.key(4.5, thrown, targetLook, 58),
        this.key(5.55, thrown.clone().add(new THREE.Vector3(0, -0.18, 0)), targetLook, 55),
      ],
      events: [
        ...(onThrown ? [{ t: 4.02, fn: onThrown }] : []),
        { t: 4.95, fade: 'in', dur: 0.32 },
      ],
    });
  }

  /** 두 번째 접촉 — 수면 높이까지 카메라가 끌려 내려간 뒤 암전한다. */
  submerge(player: THREE.Vector3, woman: THREE.Vector3, waterY: number, onSink?: () => void): Sequence {
    const pHead = player.clone().add(new THREE.Vector3(0, 1.26, 0));
    const { forward, right } = this.basis(woman, player);
    const grip = pHead.clone().lerp(woman, 0.46);
    const start = grip.clone().addScaledVector(right, 0.78).addScaledVector(forward, -0.12);
    const water = new THREE.Vector3(player.x, waterY + 0.07, player.z).addScaledVector(right, 0.36);
    const below = new THREE.Vector3(player.x, waterY - 0.38, player.z).addScaledVector(forward, -0.28);
    return this.indoors({
      id: 'well-submerge', duration: 4.65, skippable: true,
      cam: [
        this.key(0, start, grip, 43),
        this.key(2.25, water, new THREE.Vector3(player.x, waterY + 0.18, player.z), 58),
        this.key(3.5, below, new THREE.Vector3(player.x, waterY - 0.08, player.z), 66),
        this.key(4.65, below.clone().add(new THREE.Vector3(0, -0.2, 0)), below, 68),
      ],
      events: [
        ...(onSink ? [{ t: 2.2, fn: onSink }] : []),
        { t: 3.35, fade: 'in', dur: 0.62 },
      ],
    });
  }

  /** 마지막 매듭 — 밧줄, 여자, 가짜 하루의 세 꼭짓점을 한눈에 제시하고 선택으로 돌려준다. */
  finalKnot(rope: THREE.Vector3, woman: THREE.Vector3, child: THREE.Vector3): Sequence {
    const center = rope.clone().lerp(woman, 0.42).lerp(child, 0.22);
    center.y = Math.max(rope.y, woman.y - 0.15);
    const { forward, right } = this.basis(woman, child);
    const wide = center.clone().addScaledVector(right, 2.2).addScaledVector(forward, -1.1).add(new THREE.Vector3(0, 0.7, 0));
    const childCam = center.clone().addScaledVector(right, 1.35).addScaledVector(forward, 0.38).add(new THREE.Vector3(0, 0.28, 0));
    const ropeCam = rope.clone().addScaledVector(right, 1.08).addScaledVector(forward, -0.36).add(new THREE.Vector3(0, 0.45, 0));
    return this.indoors({
      id: 'well-final-knot', duration: 5.0, skippable: true,
      cam: [
        this.key(0, wide, center, 54),
        this.key(2.5, childCam, child, 45),
        this.key(5.0, ropeCam, rope.clone().lerp(woman, 0.5), 48),
      ],
    });
  }

  /** 우물 밖 — 미오를 구한 것이 아니라 동전을 운반시킨 것임을 우물과 확성기의 축으로 회수한다. */
  surfaceOutro(player: THREE.Vector3, well: THREE.Vector3, speaker: THREE.Vector3): Sequence {
    const groundLook = player.clone().add(new THREE.Vector3(0, 0.45, 0));
    const toWell = this.basis(player, well);
    const low = player.clone().addScaledVector(toWell.right, 1.65).addScaledVector(toWell.forward, -1.1).add(new THREE.Vector3(0, 0.72, 0));
    const mouth = well.clone().addScaledVector(toWell.right, 1.85).add(new THREE.Vector3(0, 1.35, 0));
    // 스피커는 소리로 방향을 전달한다. 카메라는 우물가에 남아 미오와 우물의 관계를 유지한다.
    const listen = low.clone().addScaledVector(toWell.right, 0.2).add(new THREE.Vector3(0, 0.65, 0));
    const towardVoice = groundLook.clone().addScaledVector(this.basis(player, speaker).forward, 1.0);
    towardVoice.y = player.y + 1.2;
    return {
      id: 'well-surface-outro', duration: 7.4, skippable: true, cameraPath: 'bounded',
      cam: [
        this.key(0, low, groundLook, 50),
        this.key(2.6, mouth, well.clone().add(new THREE.Vector3(0, 0.55, 0)), 47),
        this.key(5.0, listen, towardVoice, 50),
        this.key(7.4, low.clone().add(new THREE.Vector3(0, 0.55, 0)), groundLook.clone().add(new THREE.Vector3(0, 0.5, 0)), 52),
      ],
    };
  }
}
