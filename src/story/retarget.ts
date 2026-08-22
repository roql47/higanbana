import * as THREE from 'three';

/**
 * **rest 포즈가 다른 리그로 클립을 옮긴다.**
 *
 * > ⚠️ **지금은 아무도 안 쓴다** (2026-08-22). 사요(ACT 1 의 언니)가 이걸 쓰고 있었는데,
 * > 그 캐릭터의 3D 모델은 리깅 품질 문제로 통째로 걷어냈다. 아래 마지막 문단의
 * > "T 포즈 모델로 바꾼 뒤에야 제 값을 한다"는 **결론이 틀렸다** — 그때 화면이 나아진 건
 * > 이 변환 때문이 아니라 에셋의 짝(리그와 클립)이 맞아서였다.
 * >
 * > 남겨 두는 이유: 계층을 뿌리→잎으로 푸는 이 변환 자체는 맞고, 외부 모션(Mixamo 등)을
 * > 들여올 때 다시 필요하다. **쓰기 전에 에셋의 짝부터 확인할 것**
 * > (`scripts/dev/rest.ts` 로 리그와 산출물의 rest 가 같은지 본다).
 *
 * 왜 필요한가: 미오는 A 포즈 모델을 리깅한 것이고, 사요는 **T 포즈** 모델을 리깅한 것이다.
 * 본 이름 41개가 같아서 클립을 그냥 얹으면 재생은 되는데 — rest 가 다르다. 실측 차이:
 *
 *   L_Clavicle 99.9°  ·  L_Upperarm 76°  ·  R_Hand 161°
 *
 * 클립이 담고 있는 건 본의 **로컬 회전**이므로, rest 가 다르면 같은 로컬 회전이 전혀 다른
 * 월드 포즈가 된다(그냥 얹으면 상체가 접힌다).
 *
 * 고치는 법: 본마다 델타를 곱하는 건 **안 된다** — 자식의 로컬 회전은 *보정된 부모의 프레임*
 * 기준이라 체인이 어긋난다. 계층을 **뿌리에서 잎 방향으로 풀어야** 한다:
 *
 *   worldTgt(b) = worldSrc(b) · restWorldSrc(b)⁻¹ · restWorldTgt(b)
 *   localTgt(b) = worldTgt(parent)⁻¹ · worldTgt(b)
 *
 * 즉 "rest 로부터 얼마나 돌았는가"를 월드에서 보존하고, 그걸 대상 리그의 rest 방향으로
 * 다시 심는다. 부모를 먼저 확정하고 내려가므로 체인이 어긋나지 않는다.
 *
 * > 한 번 이 변환을 넣고도 화면이 망가진 적이 있다. 그때 원인은 이 수식이 아니라 **모델**이었다 —
 * > 팔이 몸통에 붙은 차렷 자세라 자동 웨이트가 팔과 치마를 섞어 놨고, 포즈가 맞아도 메시가
 * > 늘어졌다. T 포즈 모델로 바꾼 뒤에야 이 변환이 제 값을 한다.
 */
export function retargetClip(clip: THREE.AnimationClip, srcRoot: THREE.Object3D, tgtRoot: THREE.Object3D): THREE.AnimationClip {
  /** 뿌리부터 이 뼈까지 로컬 회전을 곱해 올린 값 (= rest 월드 회전) */
  const restWorld = (obj: THREE.Object3D, root: THREE.Object3D) => {
    const q = new THREE.Quaternion();
    for (let o: THREE.Object3D | null = obj; o && o !== root.parent; o = o.parent) {
      q.premultiply(o.quaternion);
      if (o === root) break;
    }
    return q;
  };

  // --- 소스 트랙을 이름별로 모으고, 아무 시각이나 샘플할 수 있게 보간기를 만든다 ---
  type Sampler = { evaluate(t: number): Float32Array };
  const sampler = (t: THREE.KeyframeTrack) => (t as unknown as { createInterpolant(): Sampler }).createInterpolant();
  const rot = new Map<string, Sampler>();
  const pos = new Map<string, Sampler>();
  let times: Float32Array | null = null;
  for (const t of clip.tracks) {
    const [name, prop] = t.name.split('.');
    if (!name || !prop) continue;
    if (prop === 'quaternion') {
      rot.set(name, sampler(t));
      if (!times || t.times.length > times.length) times = t.times as Float32Array;
    } else if (prop === 'position') {
      pos.set(name, sampler(t));
    }
  }
  if (!times || !rot.size) return clip;

  // --- 계층 순서(뿌리 → 잎)로 훑는다. 부모의 결과가 자식 계산에 필요하다 ---
  const order: THREE.Object3D[] = [];
  tgtRoot.traverse((o) => { if ((o as THREE.Bone).isBone) order.push(o); });

  const worldTgt = new Map<THREE.Object3D, THREE.Quaternion[]>();
  const tracks: THREE.KeyframeTrack[] = [];
  const qSrc = new THREE.Quaternion(), qw = new THREE.Quaternion(), qLocal = new THREE.Quaternion();
  const scale = heightRatio(srcRoot, tgtRoot);

  for (const bone of order) {
    const src = srcRoot.getObjectByName(bone.name);
    const frames: THREE.Quaternion[] = [];
    const out = new Float32Array(times.length * 4);
    // rest 차이를 흡수하는 보정항 (본마다 상수): restWorldSrc⁻¹ · restWorldTgt
    const fix = src
      ? restWorld(src, srcRoot).invert().multiply(restWorld(bone, tgtRoot))
      : new THREE.Quaternion();
    const parentWorld = bone.parent ? worldTgt.get(bone.parent) : undefined;

    for (let i = 0; i < times.length; i++) {
      const t = times[i]!;
      // ① 소스의 월드 회전 — 소스 계층을 따라 로컬 회전을 곱해 올라간다
      qSrc.identity();
      for (let o: THREE.Object3D | null = src ?? null; o && o !== srcRoot.parent; o = o.parent) {
        const r = rot.get(o.name);
        if (r) { const v = r.evaluate(t); qw.set(v[0]!, v[1]!, v[2]!, v[3]!); }
        else qw.copy(o.quaternion);
        qSrc.premultiply(qw);
        if (o === srcRoot) break;
      }
      // ② rest 보정 → 대상의 월드 회전
      qw.copy(qSrc).multiply(fix);
      frames.push(qw.clone());
      // ③ 부모의 월드를 벗겨 로컬로
      qLocal.copy(qw);
      if (parentWorld) qLocal.premultiply(parentWorld[i]!.clone().invert());
      out[i * 4] = qLocal.x; out[i * 4 + 1] = qLocal.y; out[i * 4 + 2] = qLocal.z; out[i * 4 + 3] = qLocal.w;
    }
    worldTgt.set(bone, frames);
    if (src) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, Array.from(times), Array.from(out)));
  }

  // --- 루트(엉덩이) 이동만 옮긴다. 키가 다르면 보폭·높이가 어긋나므로 비율로 줄인다 ---
  for (const [name, p] of pos) {
    const bone = tgtRoot.getObjectByName(name);
    if (!bone) continue;
    const out = new Float32Array(times.length * 3);
    for (let i = 0; i < times.length; i++) {
      const v = p.evaluate(times[i]!);
      out[i * 3] = v[0]! * scale; out[i * 3 + 1] = v[1]! * scale; out[i * 3 + 2] = v[2]! * scale;
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, Array.from(times), Array.from(out)));
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** 두 리그의 키 비율 (본 세로 폭으로 잰다) — 이동 트랙을 줄이는 데 쓴다 */
function heightRatio(srcRoot: THREE.Object3D, tgtRoot: THREE.Object3D) {
  const h = (root: THREE.Object3D) => {
    let lo = Infinity, hi = -Infinity;
    root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      o.getWorldPosition(p);
      lo = Math.min(lo, p.y); hi = Math.max(hi, p.y);
    });
    return hi > lo ? hi - lo : 1;
  };
  const a = h(srcRoot), b = h(tgtRoot);
  return a > 1e-6 ? b / a : 1;
}
