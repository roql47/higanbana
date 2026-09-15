import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { L } from '@/core/i18n';
import { DISPATCH_DIALS } from '@/story/manorDispatch';
import { investigationPaper } from '@/world/investigationProps';
import { PartsBuilder } from './kit';
import { batchManorCraft, manorBox, manorMaterials } from './manorCraft';

/** 기존 기록실에 놓는 목제 결재함. 고정 부분은 배치하고 움직이는 세 판/서랍/덮개만 분리한다. */
export class ManorDispatchProps {
  readonly group = new THREE.Group();
  readonly dialPositions: THREE.Vector3[];
  readonly pressPos: THREE.Vector3;
  readonly keyPos: THREE.Vector3;
  readonly unlockPos: THREE.Vector3;
  private dials: THREE.Group[] = [];
  private drawer = new THREE.Group();
  private key = new THREE.Group();
  private lid = new THREE.Group();
  private lever = new THREE.Group();
  private hatch = new THREE.Group();
  private packetCord = new THREE.Group();
  private packetFlap: THREE.Mesh;
  private rubbing: THREE.Mesh;
  private proof: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private proofCanvas: HTMLCanvasElement;
  private lastProof = '';
  private values: readonly number[] = [0, 0, 0];
  private printed = false;
  private opened = false;
  private hatchOpen = false;
  private rubbed = false;
  private unpacked = false;
  constructor(parent: THREE.Group, physics: Physics, readonly cluePositions: THREE.Vector3[],
    machinePos: THREE.Vector3, altar: THREE.Vector3, hatchPos: THREE.Vector3) {
    this.group.name = 'manor-dispatch'; parent.add(this.group);
    const k = new PartsBuilder(physics);
    const { wood, edge, dark, lacquer, cloth, iron: metal, brass } = manorMaterials();
    const red = k.mat(0x75352c, 1), box = manorBox;
    const pin = (parent: THREE.Object3D, at: number[], radius = 0.012, mat: THREE.Material = metal, axis: 'x' | 'y' | 'z' = 'z') => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.009, 8), mat);
      if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      mesh.position.set(at[0]!, at[1]!, at[2]!); parent.add(mesh);
    };
    const [rub, packet, reply] = cluePositions as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    k.box(0.64, 0.67, 0.045, rub.x, rub.y, rub.z + 0.027, wood);
    const rubbing = investigationPaper(this.group, rub, L('최초 행선', '最初の行先'), [L('학교·우물', '学校・井戸'), L('수정 전 원본', '修正前の原本')], 0.58);
    rubbing.rotation.set(0, Math.PI, 0); this.rubbing = rubbing;
    rubbing.material.transparent = true; rubbing.material.opacity = 0.12;
    rubbing.name = 'manor-dispatch-rubbing';
    for (const dy of [-0.31, 0.31]) {
      k.box(0.7, 0.028, 0.065, rub.x, rub.y + dy, rub.z + 0.008, edge);
      for (const dx of [-0.26, 0.26]) pin(this.group, [rub.x + dx, rub.y + dy, rub.z - 0.029], 0.01);
    }

    const pack = new THREE.Group(); pack.name = 'manor-dispatch-packet'; pack.position.copy(packet); this.group.add(pack);
    k.box(0.58, 0.09, 0.46, packet.x, packet.y - 0.08, packet.z, wood);
    const packetPaper = investigationPaper(pack, new THREE.Vector3(0, 0, 0), L('첫 배부표', '初回配布札'), [L('생존 확인', '生存確認')], 0.4);
    packetPaper.rotation.z = Math.PI;
    // A folded wrapping cloth, with a raised seam and curved knotted cord over the packet.
    box(pack, [0.49, 0.018, 0.44], [0, -0.022, 0], cloth);
    for (const dx of [-0.237, 0.237]) box(pack, [0.018, 0.055, 0.44], [dx, 0.004, 0], cloth);
    this.packetFlap = box(pack, [0.44, 0.02, 0.43], [0, 0.035, 0], cloth);
    this.packetFlap.name = 'manor-dispatch-packet-flap';
    const fold = this.packetFlap.geometry.getAttribute('position');
    for (let i = 0; i < fold.count; i++) fold.setY(i, fold.getY(i) + 0.004 * Math.sin(fold.getX(i) * 31 + fold.getZ(i) * 17));
    this.packetFlap.geometry.computeVertexNormals();
    for (const dz of [-0.2, 0.2]) box(this.packetFlap, [0.41, 0.004, 0.009], [0, 0.012, dz], edge, 0);
    this.packetCord.name = 'manor-dispatch-packet-cord'; pack.add(this.packetCord);
    const cord = (points: number[][]) => this.packetCord.add(new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2]))), 12, 0.006, 5, false), red));
    cord([[-0.25, -0.005, 0], [-0.22, 0.058, 0], [0, 0.06, 0], [0.22, 0.058, 0], [0.25, -0.005, 0]]);
    cord([[0, -0.005, -0.24], [0, 0.06, -0.2], [0, 0.065, 0], [0, 0.06, 0.2], [0, -0.005, 0.24]]);
    for (const sign of [-1, 1]) cord([[0, 0.07, 0], [sign * 0.065, 0.1, 0.045], [sign * 0.09, 0.08, 0], [0, 0.075, 0], [sign * 0.09, 0.065, -0.1]]);

    // 회신함은 실제로 빈 두 칸이다. 명판은 칸 안이 아니라 아래에 붙인다.
    k.box(0.97, 0.71, 0.04, reply.x, reply.y, reply.z - 0.03, dark);
    for (const dx of [-0.49, 0, 0.49]) k.box(0.035, 0.7, 0.28, reply.x + dx, reply.y, reply.z + 0.09, wood);
    for (const dy of [-0.35, 0.35]) k.box(1.05, 0.04, 0.3, reply.x, reply.y + dy, reply.z + 0.09, wood);
    k.box(1.05, 0.24, 0.05, reply.x, reply.y - 0.43, reply.z + 0.19, wood);
    for (const [dx, title] of [[-0.25, L('학교', '学校')], [0.25, L('우물', '井戸')]] as const) {
      box(this.group, [0.435, 0.215, 0.015], [reply.x + dx, reply.y - 0.45, reply.z + 0.22], brass);
      const label = investigationPaper(this.group, new THREE.Vector3(reply.x + dx, reply.y - 0.45, reply.z + 0.231), title, [L('확인 대기', '確認待ち')], 0.4);
      label.rotation.x = 0;
      // The worn bottom runners are visible inside the empty slots; no false reply papers.
      for (const offset of [-0.13, 0.13]) k.box(0.016, 0.015, 0.24, reply.x + dx + offset, reply.y - 0.321, reply.z + 0.09, edge);
    }

    const machine = new THREE.Group(); machine.name = 'manor-dispatch-machine'; machine.position.copy(machinePos); this.group.add(machine);
    const { x, y, z } = machinePos;
    k.box(2.12, 0.11, 0.75, x, y + 0.63, z, wood);
    for (const dx of [-0.93, 0.93]) for (const dz of [-0.27, 0.27]) k.box(0.1, 0.59, 0.1, x + dx, y + 0.295, z + dz, wood);
    k.box(1.7, 0.22, 0.61, x - 0.08, y + 0.44, z, dark);
    for (const dx of [-0.93, 0.93]) k.box(0.075, 0.08, 0.62, x + dx, y + 0.16, z, wood);
    k.box(1.87, 0.08, 0.06, x, y + 0.18, z + 0.24, wood);
    // Raised press bed, inset ink pad, bearings and a bolted cross-head.
    box(machine, [1.77, 0.045, 0.47], [-0.075, 0.707, 0.07], metal);
    box(machine, [0.44, 0.045, 0.35], [-0.4, 0.707, -0.19], dark);
    for (const dx of [-0.87, 0.74]) {
      box(machine, [0.14, 0.06, 0.31], [dx, 0.735, 0.07], metal);
      for (const dz of [-0.055, 0.195]) pin(machine, [dx, 0.77, dz], 0.015, brass, 'y');
    }
    k.collide(x, y + 0.33, z, 1.06, 0.33, 0.375);
    for (const dx of [-0.88, 0.73]) k.box(0.045, 0.52, 0.055, x + dx, y + 0.9, z + 0.17, metal);
    k.box(1.66, 0.065, 0.08, x - 0.075, y + 1.15, z + 0.17, metal);
    for (let i = 0; i < 3; i++) {
      const dx = 0.49 - i * 0.56;
      box(machine, [0.46, 0.025, 0.025], [dx, 0.683, -0.185], brass);
      for (const yy of [0.739, 1.12]) pin(machine, [dx, yy, 0.045], 0.047, metal, 'y');
    }

    // 十二面を一枚のアトラスに収める。回転中もテクスチャを作り直さない。
    const atlas = document.createElement('canvas'); atlas.width = atlas.height = 512;
    const c = atlas.getContext('2d')!; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) for (let v = 0; v < 4; v++) {
      const xx = v * 128, yy = i * 128;
      c.fillStyle = '#baa078'; c.fillRect(xx, yy, 128, 128);
      // Deterministic paper fibres, edge grime and folds stay on this same twelve-face atlas.
      for (let n = 0; n < 160; n++) {
        const px = (n * 47 + i * 17 + v * 13) % 128, py = (n * 71 + v * 29) % 128;
        c.fillStyle = n % 3 ? '#ad946f' : '#c6b08b'; c.fillRect(xx + px, yy + py, 1 + n % 4, 1);
      }
      const stain = c.createLinearGradient(xx, yy, xx + 128, yy + 128);
      stain.addColorStop(0, '#46311d44'); stain.addColorStop(0.25, '#46311d00'); stain.addColorStop(0.82, '#46311d00'); stain.addColorStop(1, '#46311d55');
      c.fillStyle = stain; c.fillRect(xx, yy, 128, 128);
      c.strokeStyle = '#725238'; c.lineWidth = 3; c.strokeRect(xx + 5, yy + 5, 118, 118);
      c.fillStyle = '#493022'; c.font = '17px serif'; c.fillText(`${i + 1} · ${DISPATCH_DIALS[i]!.title}`, xx + 64, yy + 27, 116);
      c.font = 'bold 20px serif'; c.fillText(DISPATCH_DIALS[i]!.labels[v]!, xx + 64, yy + 69, 114);
      // 원본 단서와 같은 홈. 색만으로 정답을 판단시키지 않는다.
      c.fillRect(xx + 18, yy + (v === DISPATCH_DIALS[i]!.answer ? 104 : 86 + i * 6 + v), 92, 3);
    }
    const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace;
    const ink = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    this.dialPositions = [];
    for (let i = 0; i < 3; i++) {
      // 북쪽에서 바라볼 때 1·2·3판이 왼쪽부터 읽힌다.
      const dx = 0.49 - i * 0.56;
      const dial = new THREE.Group(); dial.name = `manor-dispatch-dial-${i}`;
      dial.position.set(dx, 0.91, 0.045); machine.add(dial); this.dials.push(dial);
      box(dial, [0.36, 0.36, 0.36], [0, 0, 0], wood);
      box(dial, [0.095, 0.07, 0.095], [0, 0.213, 0], brass);
      for (const yy of [-0.165, 0.165]) box(dial, [0.371, 0.018, 0.371], [0, yy, 0], metal, 0.004);
      const faces: THREE.BufferGeometry[] = [];
      for (let face = 0; face < 4; face++) {
        const angle = Math.PI + face * Math.PI / 2;
        const geo = new THREE.PlaneGeometry(0.3, 0.3), uv = geo.getAttribute('uv');
        for (let u = 0; u < uv.count; u++) uv.setXY(u, (uv.getX(u) + face) / 4, (uv.getY(u) + 3 - i) / 4);
        geo.rotateY(angle); geo.translate(Math.sin(angle) * 0.182, 0, Math.cos(angle) * 0.182);
        faces.push(geo);
      }
      dial.add(new THREE.Mesh(mergeGeometries(faces)!, ink)); faces.forEach(face => face.dispose());
      this.dialPositions.push(new THREE.Vector3(x + dx, y + 0.78, z - 0.23));
    }
    this.lever.name = 'manor-dispatch-lever'; this.lever.position.set(0.94, 0.68, 0.08); machine.add(this.lever);
    box(this.lever, [0.045, 0.37, 0.045], [0, 0.185, 0], metal);
    box(this.lever, [0.18, 0.065, 0.08], [0, 0.4, 0], edge);
    pin(this.lever, [0, 0.04, 0], 0.06, brass, 'x');
    this.pressPos = new THREE.Vector3(x + 0.96, y + 0.69, z - 0.25);
    this.drawer.name = 'manor-dispatch-drawer'; this.drawer.position.set(-0.12, 0.47, -0.13); machine.add(this.drawer);
    box(this.drawer, [1.28, 0.03, 0.48], [0, -0.07, 0], wood);
    for (const dx of [-0.625, 0.625]) box(this.drawer, [0.03, 0.12, 0.48], [dx, -0.012, 0], wood);
    box(this.drawer, [1.28, 0.12, 0.025], [0, -0.012, 0.225], wood);
    box(this.drawer, [1.19, 0.007, 0.42], [0, -0.048, 0], cloth, 0);
    box(this.drawer, [1.32, 0.19, 0.045], [0, 0, -0.25], edge);
    box(this.drawer, [0.29, 0.075, 0.015], [0, 0, -0.282], metal);
    for (const dx of [-0.105, 0.105]) box(this.drawer, [0.025, 0.045, 0.06], [dx, 0, -0.3], brass);
    box(this.drawer, [0.22, 0.022, 0.022], [0, -0.022, -0.335], brass);
    for (const dx of [-0.57, 0.57]) pin(this.drawer, [dx, 0, -0.278], 0.013, metal);
    const keyMark = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 5, 12), metal);
    keyMark.position.set(0.37, 0, -0.279); this.drawer.add(keyMark);
    box(this.drawer, [0.095, 0.012, 0.012], [0.433, 0, -0.281], metal);
    for (const dx of [0.455, 0.482]) box(this.drawer, [0.012, 0.036, 0.012], [dx, -0.012, -0.281], metal);
    this.key.name = 'manor-dispatch-key'; this.key.position.set(0, -0.028, 0); this.drawer.add(this.key);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 6, 16), metal);
    ring.rotation.x = Math.PI / 2; this.key.add(ring);
    box(this.key, [0.18, 0.022, 0.02], [0.12, 0, 0], metal);
    for (const dx of [0.15, 0.2]) box(this.key, [0.02, 0.025, 0.06], [dx, 0, 0.02], metal);
    this.keyPos = new THREE.Vector3(x - 0.12, y + 0.43, z - 0.63);
    this.proofCanvas = document.createElement('canvas'); this.proofCanvas.width = this.proofCanvas.height = 256;
    const proofTexture = new THREE.CanvasTexture(this.proofCanvas); proofTexture.colorSpace = THREE.SRGBColorSpace;
    this.proof = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.33), new THREE.MeshStandardMaterial({ map: proofTexture, roughness: 1 }));
    this.proof.name = 'manor-dispatch-proof'; this.proof.rotation.set(-Math.PI / 2, 0, Math.PI);
    this.proof.position.set(-0.4, 0.733, -0.19); machine.add(this.proof); this.proof.visible = false;

    // 실제 봉인패 앞의 여닫는 목제 덮개. 기존 불단의 서향 정면과 맞춘다.
    this.unlockPos = altar.clone().add(new THREE.Vector3(-0.7, 0, 0));
    k.box(0.06, 0.08, 0.83, altar.x - 0.4, altar.y + 0.41, altar.z, wood);
    for (const dz of [-0.395, 0.395]) k.box(0.06, 0.78, 0.04, altar.x - 0.4, altar.y + 0.06, altar.z + dz, wood);
    this.lid.name = 'manor-fuda-cover'; this.lid.position.set(altar.x - 0.43, altar.y + 0.06, altar.z + 0.37); this.group.add(this.lid);
    box(this.lid, [0.035, 0.6, 0.68], [0.012, 0, -0.37], lacquer);
    for (const dz of [-0.7, -0.04]) box(this.lid, [0.075, 0.68, 0.067], [-0.007, 0, dz], wood);
    for (const yy of [-0.3, 0.3]) box(this.lid, [0.08, 0.072, 0.74], [-0.008, yy, -0.37], edge);
    // Recessed panel, narrow lattice and real hinge barrels on the moving cabinet leaf.
    for (let i = 0; i < 5; i++) box(this.lid, [0.035, 0.34, 0.012], [-0.033, 0.065, -0.12 - i * 0.12], wood, 0.003);
    for (const yy of [-0.11, 0.22]) box(this.lid, [0.035, 0.02, 0.59], [-0.034, yy, -0.37], wood);
    for (const yy of [-0.21, 0.21]) {
      box(this.lid, [0.08, 0.07, 0.17], [-0.008, yy, -0.075], metal);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8), brass);
      hinge.position.set(0, yy, -0.015); this.lid.add(hinge);
      for (const dz of [-0.045, -0.13]) pin(this.lid, [-0.052, yy, dz], 0.009, brass, 'x');
    }
    box(this.lid, [0.08, 0.13, 0.085], [-0.025, -0.03, -0.61], brass);
    box(this.lid, [0.005, 0.033, 0.009], [-0.067, -0.032, -0.61], dark, 0);

    // 이동은 기존 사다리 연출을 유지하고, 마루의 닫힌 판도 실제로 들어 올린다.
    this.hatch.name = 'manor-archive-hatch';
    this.hatch.position.set(hatchPos.x - 0.675, hatchPos.y - 0.04, hatchPos.z); this.group.add(this.hatch);
    box(this.hatch, [1.35, 0.09, 1.35], [0.675, 0, 0], dark);
    for (const dz of [-0.38, 0, 0.38]) box(this.hatch, [1.2, 0.035, 0.3], [0.675, 0.06, dz], wood);
    for (const dx of [0.23, 1.1]) {
      box(this.hatch, [0.055, 0.012, 1.22], [dx, 0.085, 0], metal, 0.002);
      for (const dz of [-0.5, 0, 0.5]) pin(this.hatch, [dx, 0.096, dz], 0.012, brass, 'y');
    }
    for (const dz of [-0.45, 0.45]) box(this.hatch, [0.25, 0.025, 0.075], [0.07, 0.093, dz], metal);
    const pull = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14), metal);
    pull.rotation.y = Math.PI / 2; pull.position.set(1.11, 0.13, 0); this.hatch.add(pull);
    k.box(1.3, 0.013, 1.3, hatchPos.x, hatchPos.y - 0.08, hatchPos.z, dark);
    this.group.add(k.build('manor-dispatch-static'));
    batchManorCraft(this.group);
  }
  setProgress(values: readonly number[], clues: readonly boolean[], printed: boolean, hasKey: boolean, opened: boolean, hatchOpen: boolean) {
    this.values = values; this.printed = printed; this.opened = opened; this.hatchOpen = hatchOpen;
    this.rubbed = clues[0] ?? false; this.unpacked = clues[1] ?? false;
    this.key.visible = printed && !hasKey; this.packetCord.visible = !this.unpacked;
    if (this.rubbed) (this.rubbing.material as THREE.MeshStandardMaterial).opacity = 1;
    if (printed) this.showProof(values, true);
  }
  setRubbing(progress: number) {
    (this.rubbing.material as THREE.MeshStandardMaterial).opacity = this.rubbed ? 1 : 0.12 + progress * 0.88;
  }
  setPress(progress: number) { this.lever.rotation.x = -progress * 0.72; }
  showProof(values: readonly number[], matches: boolean) {
    const signature = `${values.join('-')}:${matches}`;
    if (signature === this.lastProof) return;
    this.lastProof = signature;
    const c = this.proofCanvas.getContext('2d')!;
    c.fillStyle = '#c2b191'; c.fillRect(0, 0, 256, 256); c.textAlign = 'center';
    c.fillStyle = '#77332b'; c.font = 'bold 25px serif';
    values.forEach((value, i) => c.fillText(DISPATCH_DIALS[i]!.labels[value]!, 128, 56 + i * 53, 230));
    c.strokeStyle = '#77332b'; c.lineWidth = 4;
    for (let i = 0; i < 3; i++) { c.beginPath(); const y = matches ? 218 : 204 + i * 12; c.moveTo(22 + i * 73, y); c.lineTo(91 + i * 73, y); c.stroke(); }
    this.proof.material.map!.needsUpdate = true; this.proof.visible = true;
  }
  update(dt: number) {
    const t = 1 - Math.exp(-Math.max(0, dt) * 8);
    this.dials.forEach((dial, i) => {
      const delta = -this.values[i]! * Math.PI / 2 - dial.rotation.y;
      dial.rotation.y += Math.atan2(Math.sin(delta), Math.cos(delta)) * t;
    });
    this.drawer.position.z = THREE.MathUtils.lerp(this.drawer.position.z, this.printed ? -0.53 : -0.13, t);
    this.lid.rotation.y = THREE.MathUtils.lerp(this.lid.rotation.y, this.opened ? Math.PI * 0.56 : 0, t);
    this.hatch.rotation.z = THREE.MathUtils.lerp(this.hatch.rotation.z, this.hatchOpen ? Math.PI * 0.46 : 0, t);
    this.packetFlap.position.z = THREE.MathUtils.lerp(this.packetFlap.position.z, this.unpacked ? 0.45 : 0, t);
  }
}
