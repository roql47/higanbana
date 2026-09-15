import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { L } from '@/core/i18n';
import { investigationPaper } from '@/world/investigationProps';

/** 작은 실제 소품과 같은 위치의 와쿄 소품. 별도 광원/렌더 타깃/GLB를 만들지 않는다. */
export class InnAfterimageProps {
  readonly clues: THREE.Vector3[];
  readonly steps: THREE.Vector3[];
  private lids: THREE.Object3D[] = [];
  private cloths: THREE.Object3D[] = [];
  private boxOpen = false;
  private complete = false;
  constructor(real: THREE.Group, mirror: THREE.Scene, box: THREE.Vector3, screen: THREE.Vector3,
    shoe: THREE.Vector3, key: THREE.Vector3) {
    this.clues = [box.clone().add(new THREE.Vector3(-0.2, 0.16, 0)), screen.clone().add(new THREE.Vector3(-0.1, 0.5, -0.6)), shoe, key];
    this.steps = [this.clues[1]!.clone(), this.clues[0]!.clone()];
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const wood = new THREE.MeshStandardMaterial({ color: 0x675039, roughness: 0.95 });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x796756, roughness: 1 });
    const char = new THREE.MeshStandardMaterial({ color: 0x29241f, roughness: 1 });
    const put = (parent: THREE.Object3D, size: number[], pos: number[], mat: THREE.Material) => {
      const m = new THREE.Mesh(cube, mat); m.scale.set(size[0]!, size[1]!, size[2]!);
      m.position.set(pos[0]!, pos[1]!, pos[2]!); m.receiveShadow = true; parent.add(m); return m;
    };
    const root = new THREE.Group(); root.name = 'inn-waiting-props'; real.add(root);
    const chest = new THREE.Group(); chest.name = 'inn-keepsake-box'; chest.position.copy(box); root.add(chest);
    put(chest, [0.44, 0.028, 0.46], [0, 0.014, 0], wood);
    for (const x of [-0.208, 0.208]) put(chest, [0.024, 0.13, 0.46], [x, 0.08, 0], wood);
    for (const z of [-0.218, 0.218]) put(chest, [0.4, 0.13, 0.024], [0, 0.08, z], wood);
    const lid = new THREE.Group(); lid.name = 'inn-box-lid'; lid.position.y = 0.161; chest.add(lid);
    put(lid, [0.46, 0.03, 0.48], [0, 0, 0], wood);
    put(lid, [0.025, 0.018, 0.16], [-0.12, 0.022, 0], wood);
    investigationPaper(lid, new THREE.Vector3(0.03, 0.016, 0), L('보관', '預かり'), [L('매화 → 소나무', '梅 → 松')], 0.27);
    investigationPaper(chest, new THREE.Vector3(0, 0.032, 0), L('둘이 함께', '二人一緒に'), [L('돌아오면', '戻ったら'), L('건네줄 것', '渡すこと')], 0.37);
    const cloth = put(chest, [0.35, 0.022, 0.32], [0, 0.053, 0], fabric); cloth.name = 'inn-box-cloth';
    // 모서리 자수는 작은 입체 매화잎 다섯 장. 텍스처나 손바닥 표식을 추가하지 않는다.
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const petal = put(cloth, [0.08, 0.06, 0.045], [0.3 + Math.cos(a) * 0.055, 0.54, 0.26 + Math.sin(a) * 0.065], wood);
      petal.rotation.y = -a;
    }
    const shelf = new THREE.Group(); shelf.name = 'inn-visitor-tags'; shelf.position.copy(shoe); root.add(shelf);
    for (let i = 0; i < 2; i++) {
      const tag = put(shelf, [0.025, i ? 0.18 : 0.23, 0.115], [0, 0, i * 0.18 - 0.09], wood);
      const p = investigationPaper(tag, new THREE.Vector3(0.52, 0, 0), L('축제 방문', '祭りの来客'), [L('잠시 맡김', '一時預かり')], 0.88);
      p.rotation.set(0, Math.PI / 2, 0);
    }
    const request = investigationPaper(root, key.clone().add(new THREE.Vector3(0.02, 0.001, -0.075)), L('매화 → 소나무', '梅 → 松'),
      [L('아이들이 진정하면', '子供が落ち着いたら'), L('다시 불러 주세요', 'また呼んでください')], 0.26);
    request.rotation.z = 0.08;
    // 함·열쇠 쪽지·보관표는 양쪽 세계에 같은 형태로 둔다.
    const past = root.clone(true); mirror.add(past);
    this.lids = [lid, past.getObjectByName('inn-box-lid')!];
    this.cloths = [cloth, past.getObjectByName('inn-box-cloth')!];
    for (const [parent, burnt] of [[root, true], [past, false]] as const) {
      const rest = new THREE.Group(); rest.name = 'inn-waiting-cushions'; rest.position.copy(screen); parent.add(rest);
      for (let i = 0; i < 2; i++) {
        const mat = put(rest, [i ? 0.46 : 0.59, burnt ? 0.016 : 0.075, i ? 0.46 : 0.59],
          [-0.37 + i * 0.67, burnt ? 0.012 : 0.047, -0.58], burnt ? char : fabric);
        mat.rotation.y = i ? 0.15 : -0.1;
      }
      put(rest, [0.24, burnt ? 0.008 : 0.025, 0.17], [0.27, burnt ? 0.025 : 0.1, -0.78], burnt ? char : wood);
      // 案内札は自立した小さな木札。焼けた現実側では文字が失われている。
      const stand = put(rest, [0.025, 0.35, 0.26], [-0.8, 0.2, -0.58], burnt ? char : wood);
      if (!burnt) {
        const p = investigationPaper(stand, new THREE.Vector3(-0.51, 0, 0), L('쉬고 있어요', '休んでいます'), [L('아이들', '子供たち')], 0.9);
        p.rotation.set(0, -Math.PI / 2, 0);
      }
    }
    // 고정 목재·천 조각은 재질별 한 드로우로 합친다. 뚜껑·천의 변환 경계는 유지한다.
    const moving = new Set([...this.lids, ...this.cloths]);
    for (const scope of [root, past, ...moving]) {
      scope.updateWorldMatrix(true, true);
      const inverse = scope.matrixWorld.clone().invert();
      const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const visit = (o: THREE.Object3D) => {
        if (o !== scope && moving.has(o)) return;
        for (const child of [...o.children]) visit(child);
        if (o === scope || !(o instanceof THREE.Mesh) || o.geometry !== cube || o.children.length) return;
        const g = cube.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
        const material = o.material as THREE.Material;
        const bucket = batches.get(material) ?? []; bucket.push(g); batches.set(material, bucket);
        o.removeFromParent();
      };
      visit(scope);
      for (const [material, parts] of batches) {
        const merged = mergeGeometries(parts)!; parts.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(merged, material); mesh.name = 'inn-waiting-static';
        mesh.receiveShadow = true; scope.add(mesh);
      }
    }
  }
  setProgress(boxOpen: boolean, complete: boolean) { this.boxOpen = boxOpen; this.complete = complete; }
  update(dt: number) {
    const t = 1 - Math.exp(-Math.max(0, dt) * 6);
    for (const lid of this.lids) lid.position.x = THREE.MathUtils.lerp(lid.position.x, this.boxOpen ? -0.31 : 0, t);
    for (const cloth of this.cloths) cloth.position.z = THREE.MathUtils.lerp(cloth.position.z, this.complete ? 0.38 : 0, t);
  }
}
