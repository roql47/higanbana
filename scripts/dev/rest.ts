/**
 * **두 GLB 의 rest 포즈를 나란히 찍어 본다.**
 *
 * `build:character` 는 `--base`(리그) 와 `--clips`(클립) 의 짝이 틀려도 **조용히 성공한다** —
 * 본 이름이 같으면 채널이 전부 연결되기 때문이다. 어긋난 건 화면에서야 드러나고, 그때는
 * 애니메이션이 이상한 건지 리깅이 이상한 건지 구분이 안 된다.
 *
 * rest 회전을 비교하면 한 번에 갈린다. 실측(2026-08-22, 사요가 무너져 있던 원인):
 *
 *   L_Hand      sayo(-0.35,-0.02,-0.66,0.75)  vs  sayo-t(0.01,0.00,-0.17,0.99)   → 128° 차이
 *   L_Upperarm                                                                   →  64° 차이
 *
 * 클립은 본의 **로컬 회전**을 담으므로, rest 가 이만큼 다르면 같은 로컬 회전이 전혀 다른
 * 월드 포즈가 된다 — 머리가 가슴에 파묻힌다.
 *
 *   node scripts/dev/rest.ts assets/tripo/final-tripo/rig/model_url.glb public/models/character.glb
 *
 * 리그 GLB 와 빌드 산출물의 rest 가 **같아야** 짝이 맞은 것이다.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('사용법: node scripts/dev/rest.ts <glb> [<glb> …]');

/**
 * 리그마다 이름이 다르므로 v1.0(사람 이름)·v2.5(일반 이름) 둘 다 훑는다.
 *
 * ⚠️ v2.5 이름은 파일에 `tripo::0_Left_Limb_0` 로 적혀 있다 — **three 만 `::` 를 지운다**
 * (`PropertyBinding.sanitizeNodeName`). 여기(gltf-transform)는 파일 그대로 읽으므로
 * `::` 가 붙은 이름으로 찾아야 한다. 브라우저 콘솔에서 본 이름을 그대로 옮겨 적으면 안 걸린다.
 */
const KEY = [
  'L_Upperarm', 'L_Forearm', 'L_Hand', 'R_Upperarm', 'R_Hand',
  'Waist', 'Spine01', 'NeckTwist01', 'Head', 'L_Thigh',
  'L_Clavicle', 'R_Clavicle', 'R_Forearm',
  // 트위스트 본 — 팔뚝·위팔의 **곁가지**라 눈에 안 띄지만, rest 가 어긋나면 소매가 전단(shear)된다
  'L_UpperarmTwist01', 'L_UpperarmTwist02', 'L_ForearmTwist01', 'L_ForearmTwist02',
  'R_UpperarmTwist01', 'R_UpperarmTwist02', 'R_ForearmTwist01', 'R_ForearmTwist02',
  'tripo::Spine_3', 'tripo::Spine_4', 'tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1',
  'tripo::0_Right_Limb_0', 'tripo::0_Right_Limb_1', 'tripo::Head_0', 'bone_6',
];

/** 쿼터니언을 사람이 읽는 각도로 — 두 rest 가 몇 도 떨어져 있는지가 알고 싶은 전부다 */
const angleDeg = (q: number[]) => 2 * Math.acos(Math.min(1, Math.abs(q[3] ?? 1))) * (180 / Math.PI);

const rows: Record<string, Record<string, string>> = {};
for (const p of paths) {
  const doc = await io.read(p);
  const anims = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`--- ${p}   클립: ${anims.join(', ') || '(없음)'}   노드 ${doc.getRoot().listNodes().length}`);
  for (const n of doc.getRoot().listNodes()) {
    const name = n.getName();
    if (!KEY.includes(name)) continue;
    const q = [...n.getRotation()];
    (rows[name] ??= {})[p] = `${q.map((v) => v.toFixed(3)).join(',')}  (${angleDeg(q).toFixed(0)}°)`;
  }
}

for (const [name, byPath] of Object.entries(rows)) {
  console.log(`\n  ${name}`);
  for (const p of paths) console.log(`    ${byPath[p] ?? '(없음)'}   ${p}`);
}
