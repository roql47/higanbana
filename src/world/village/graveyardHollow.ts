import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { PartsBuilder, tileTex, textCanvas } from '../higasato/kit';
import { investigationPaper } from '../investigationProps';
import { L } from '@/core/i18n';
import { StreamedDetail } from '../streamedDetail';
import { buildGraveyardHollowArt, type HollowShoeDisplay } from './graveyardHollowArt';

/** 지장의 시선 안쪽에 접힌 묘역. 지형 아래의 독립된 바닥/벽으로 지상과 물리를 분리한다. */
export class GraveyardHollow {
  readonly group = new THREE.Group();
  readonly floorY: number;
  readonly landing: THREE.Vector3;
  readonly exit: THREE.Vector3;
  readonly getaPos: THREE.Vector3;
  readonly clues: THREE.Vector3[];
  readonly candidates: THREE.Vector3[];
  readonly detail: StreamedDetail;
  private readonly decoys: THREE.Group[] = [];
  private readonly repair: THREE.Group;
  private readonly veil: THREE.Mesh;
  private wasInside = false;
  private readonly recovery = new THREE.Vector3();
  private readonly shoeDisplays: HollowShoeDisplay[] = [];

  constructor(scene: THREE.Scene, physics: Physics, readonly center: THREE.Vector3) {
    this.floorY = center.y - 18;
    const p = (x: number, z: number, y = 0) => new THREE.Vector3(center.x + x, this.floorY + y, center.z + z);
    this.landing = p(0, 7.5, 0.12);
    this.exit = p(0, 10.8, 0.8);
    this.candidates = [p(-7, -6, 0.5), p(0, -8, 0.5), p(7, -6, 0.5)];
    this.getaPos = this.candidates[1]!.clone();
    this.clues = [p(-1.9, 6.1, 0.018), p(7.1, 4.4, 0.507)];
    this.group.name = 'graveyard-hollow';
    this.group.visible = false;

    const k = new PartsBuilder(physics);
    const stone = k.texMat(tileTex('/textures/stone/japanese_stone_wall_diff_1k.webp', true),
      tileTex('/textures/stone/japanese_stone_wall_nor_gl_1k.webp', false), 0x52574f,
      { rough: 1, repeat: 0.48, normalScale: 0.45 });
    const dark = k.texMat(tileTex('/textures/minka/aged-mud-plaster-diff-1k.webp', true),
      tileTex('/textures/minka/aged-mud-plaster-nor-gl-1k.webp', false), 0x686258,
      { rough: 1, repeat: 0.65, normalScale: 0.3 });
    const worn = k.texMat(tileTex('/textures/plaster/grey_plaster_02_diff_1k.webp', true),
      tileTex('/textures/plaster/grey_plaster_02_nor_gl_1k.webp', false), 0x747568,
      { rough: 1, repeat: 0.8, normalScale: 0.4 });
    // 등불 밖에서도 갈림길의 윤곽은 읽혀야 한다. 추가 광원 없이 재질에 약한 냉색 채움을 준다.
    stone.emissive.setHex(0x839bad); stone.emissiveIntensity = 0.65; stone.emissiveMap = stone.map;
    dark.emissive.setHex(0x879294); dark.emissiveIntensity = 0.5; dark.emissiveMap = dark.map;
    worn.emissive.setHex(0x8a969c); worn.emissiveIntensity = 0.55; worn.emissiveMap = worn.map;
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, solid = true) => {
      k.box(w, h, d, center.x + x, this.floorY + y, center.z + z, mat);
      if (solid) k.collide(center.x + x, this.floorY + y, center.z + z, w / 2, h / 2, d / 2);
    };
    box(0, -0.25, 0, 24, 0.5, 26, dark);
    box(-11.7, 1.3, 0, 0.6, 2.6, 26, stone);
    box(11.7, 1.3, 0, 0.6, 2.6, 26, stone);
    box(0, 1.3, -12.7, 24, 2.6, 0.6, stone);
    box(0, 1.3, 12.7, 24, 2.6, 0.6, stone);
    // 입구의 열린 마당에서 세 길로 갈라진다. 칸막이 뒤로 가려져 한눈에 정답이 보이지 않는다.
    for (const x of [-3.5, 3.5]) {
      box(x, 0.85, -3.2, 0.65, 1.7, 10.0, stone);
      for (const z of [-8, -3.2, 1.6]) box(x, 1.55, z, 0.88, 3.1, 0.85, worn);
    }
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const x = Math.sin(a) * 10.5, z = Math.cos(a) * 11.5;
      // 세 귀환문의 접근로를 비운다. 앞에 묘석이 서면 문과 붉은 매듭을 읽기 어렵다.
      if (z > 7 && [0, -7.5, 7.5].some(gateX => Math.abs(x - gateX) < 1.5)) continue;
      box(x, 0.72, z, 0.65, 1.44 + (i % 3) * 0.25, 0.48, worn);
      box(x, 0.12, z, 1.1, 0.24, 0.9, dark);
    }
    // 세 받침대와 남겨진 짝의 자리. 모든 조사 앵커는 벽 앞의 도달 가능한 표면이다.
    for (const at of [...this.candidates, this.clues[1]!]) {
      box(at.x - center.x, 0.25, at.z - center.z, 0.95, 0.5, 0.75, worn);
    }
    // 석등의 불빛 표면은 앞마당·세 길·되돌아올 문을 읽게 한다. 동적 광원은 늘리지 않는다.
    const paperGlow = new THREE.MeshBasicMaterial({ color: 0xd9ac69 });
    for (const [x, z] of [[-2.7, 6.1], [6, 4.4], [-7, -7.3], [0, -9.3], [7, -7.3], [0.85, 10.5]]) {
      box(x!, 0.48, z!, 0.18, 0.96, 0.18, worn, false);
      box(x!, 1.03, z!, 0.29, 0.26, 0.29, paperGlow, false);
      box(x!, 1.22, z!, 0.48, 0.12, 0.48, stone, false);
    }
    // 붉은 매듭이 있는 문과, 목소리만 나는 양쪽 가짜 문.
    for (const x of [-7.5, 0, 7.5]) {
      for (const side of [-1, 1]) box(x + side * 1.05, 1.8, 11.1, 0.42, 3.6, 0.58, worn);
      box(x, 3.7, 11.1, 2.8, 0.48, 0.8, worn);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.1), new THREE.MeshBasicMaterial({ color: 0x08090c, side: THREE.DoubleSide }));
      curtain.position.copy(p(x, 11.25, 1.65)); this.group.add(curtain);
    }
    const shell = k.build('hollow-stone', { spatialCellSize: 8 });
    shell.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
    this.group.add(shell);
    // 지상의 하늘과 땅은 이 구역에서 컬링된다. 닫힌 검은 돔이 다른 지하 공간을 가린다.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 10), new THREE.MeshBasicMaterial({ color: 0x080b10, side: THREE.BackSide, fog: false }));
    dome.position.copy(p(0, 0)); this.group.add(dome);
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.05), new THREE.MeshStandardMaterial({
      color: 0x9d251e, emissive: 0x4b0905, emissiveIntensity: 0.3, side: THREE.DoubleSide, roughness: 1,
    }));
    ribbon.position.copy(p(0.88, 10.75, 1.48)); ribbon.rotation.z = -0.19; this.group.add(ribbon);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.033, 5, 10), ribbon.material);
    knot.position.copy(p(0.88, 10.73, 1.95)); this.group.add(knot);

    investigationPaper(this.group, this.clues[0]!, L('돌아온 사람', 'もどったひと'), [L('발끝은 문으로', 'つまさきは門へ')], 0.52);
    const clothMap = textCanvas(256, 256, ctx => {
      ctx.fillStyle='#999580'; ctx.fillRect(0,0,256,256);
      for(let y=0;y<256;y+=2) for(let x=0;x<256;x+=2) {
        const v=139+((x*17+y*31)%19)+(x%4===y%4?10:0);
        ctx.fillStyle=`rgb(${v},${v-5},${v-19})`; ctx.fillRect(x,y,1,2);
      }
      ctx.strokeStyle='#696956'; ctx.lineWidth=1;
      for(const inset of [5,8])ctx.strokeRect(inset,inset,256-inset*2,256-inset*2);
      const wet=ctx.createRadialGradient(190,215,5,190,215,105);
      wet.addColorStop(0,'rgba(35,42,34,.48)');wet.addColorStop(1,'rgba(35,42,34,0)');
      ctx.fillStyle=wet;ctx.fillRect(0,0,256,256);
    });
    const clothGeo=new THREE.PlaneGeometry(.55,.5,16,16), clothPos=clothGeo.getAttribute('position');
    for(let i=0;i<clothPos.count;i++) {
      const x=clothPos.getX(i),y=clothPos.getY(i);
      clothPos.setZ(i,.002*Math.sin(x*63+y*12)+.007*Math.pow(Math.abs(x)/.275,8));
    }
    clothGeo.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map:clothMap, roughness:.94, side:THREE.DoubleSide }));
    cloth.position.copy(this.clues[1]!).add(new THREE.Vector3(0, -0.004, 0));
    cloth.rotation.set(-Math.PI / 2, 0, 0.15); this.group.add(cloth);
    const shoeDisplay = (repaired: boolean, scale: number, at: THREE.Vector3, yaw: number) => {
      const parent = new THREE.Group(), fallback = makeGeta(repaired, scale);
      parent.position.copy(at); parent.rotation.y=yaw; parent.add(fallback); this.group.add(parent);
      this.shoeDisplays.push({parent,fallback,scale,repaired}); return parent;
    };
    shoeDisplay(true, 1, this.clues[1]!, Math.PI * 0.3);
    this.candidates.forEach((at, i) => {
      if (i === 1) return;
      const shoe = shoeDisplay(i === 2, i === 2 ? 1.5 : 1, at, -0.3);
      this.decoys.push(shoe);
    });
    // 진짜 공물 모델은 Rules 소유다. 그 위의 수선 실만 동일한 표식으로 보강한다.
    this.repair = new THREE.Group(); this.repair.position.copy(this.getaPos);
    addRepair(this.repair, 0.18); this.group.add(this.repair);
    this.veil = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.025, 0.055), new THREE.MeshStandardMaterial({ color: 0x292728, roughness: 1 }));
    this.veil.position.copy(this.getaPos).add(new THREE.Vector3(0, 0, 0.22)); this.group.add(this.veil);

    // 발끝/뒤꿈치가 구별되는 젖은 발자국. 84개를 한 번의 인스턴스 드로우로 그린다.
    const foot = new THREE.Shape();
    foot.moveTo(-0.045, -0.13); foot.bezierCurveTo(-0.095, -0.12, -0.07, -0.02, -0.085, 0.07);
    foot.bezierCurveTo(-0.10, 0.20, 0.09, 0.24, 0.09, 0.095);
    foot.bezierCurveTo(0.06, 0.025, 0.035, -0.055, 0.035, -0.13);
    foot.quadraticCurveTo(0, -0.19, -0.045, -0.13);
    const geo = new THREE.ShapeGeometry(foot, 7); geo.rotateX(-Math.PI / 2);
    const steps = 28;
    const prints = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x17100d, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }), steps * 3);
    const dummy = new THREE.Object3D(); let n = 0;
    for (let lane = 0; lane < 3; lane++) {
      const x = (lane - 1) * 7;
      for (let step = 0; step < steps; step++) {
        // 양쪽 길은 넓은 앞마당을 거쳐 칸막이 바깥으로 돌아 들어간다.
        const t = step / (steps - 1), bend = 0.45;
        // 첫 발부터 세 줄을 벌려 겹친 검은 얼룩이 되지 않게 한다. 보폭은 약 0.45~0.55 m.
        const px = lane === 1 ? 0 : t < bend ? x * (0.1 + 0.9 * t / bend) : x;
        const pz = lane === 1 ? 5.3 - t * 12 : t < bend ? 5.3 - t / bend * 2.4 : 2.9 - (t - bend) / (1 - bend) * 7.8;
        const yaw = lane === 1 ? Math.PI : t < bend ? (lane === 0 ? 1 : -1) * 1.207 : 0;
        const stride = step % 2 ? 0.1 : -0.1;
        dummy.position.copy(p(px + Math.cos(yaw) * stride, pz - Math.sin(yaw) * stride, 0.012));
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.setScalar(0.64); dummy.updateMatrix(); prints.setMatrixAt(n++, dummy.matrix);
      }
    }
    prints.computeBoundingSphere(); this.group.add(prints);
    this.detail = new StreamedDetail(this.group, {
      minX: center.x - 12, maxX: center.x + 12, minZ: center.z - 13, maxZ: center.z + 13,
    }, bundle => buildGraveyardHollowArt(bundle, center, this.floorY, this.shoeDisplays),
    [shell, ...this.shoeDisplays.map(s=>s.fallback)], 'graveyard-hollow');
    scene.add(this.group);
  }

  contains(p: THREE.Vector3) {
    return Math.abs(p.x - this.center.x) < 12.1 && Math.abs(p.z - this.center.z) < 13.1
      && p.y > this.floorY - 1.5 && p.y < this.floorY + 6;
  }
  /** 바닥/모서리를 잠깐 벗어나도 지상 미로로 보내지 않고 같은 묘역 안에서 복구한다. */
  recoverPosition(p: THREE.Vector3): THREE.Vector3 | null {
    const inside = this.contains(p);
    const recover = this.wasInside && !inside && p.y < this.floorY + 6
      && Math.abs(p.x - this.center.x) < 18 && Math.abs(p.z - this.center.z) < 19;
    this.wasInside = inside || recover;
    if (!recover) return null;
    // 벽·받침대 사이의 확정된 착지점. 진행 단서와 공물은 그대로 유지한다.
    return this.recovery.copy(this.landing);
  }
  update(p: THREE.Vector3, dt = 0) {
    this.detail.update(dt, p);
    this.group.visible = this.contains(p); if (this.group.visible) this.wasInside = true;
  }
  setProgress(matched: boolean, taken: boolean) {
    this.veil.visible = !matched && !taken;
    this.repair.visible = !taken;
    for (const decoy of this.decoys) decoy.visible = !taken;
  }
}

function addRepair(group: THREE.Group, y: number) {
  const thread = new THREE.MeshStandardMaterial({ color: 0x719ba7, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.011, 0.045), thread);
    stitch.position.set(-0.025 + i * 0.025, y, -0.005); stitch.rotation.y = -0.3; group.add(stitch);
  }
}

function makeGeta(repaired: boolean, scale: number) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: repaired ? 0x624b30 : 0xa17b4c, roughness: 0.94 });
  const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.19, 3, 8), wood);
  sole.rotation.x = Math.PI / 2; sole.scale.z = 0.28; sole.position.y = 0.065; group.add(sole);
  for (const z of [-0.08, 0.09]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, repaired && z > 0 ? 0.035 : 0.055, 0.035), wood);
    tooth.position.set(0, 0.027, z); if (repaired && z > 0) tooth.rotation.z = 0.15; group.add(tooth);
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.065, 0.085, 0.05), new THREE.Vector3(0, 0.14, -0.035), new THREE.Vector3(0.065, 0.085, 0.05)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.014, 5, false), new THREE.MeshStandardMaterial({ color: 0x8a201c, roughness: 1 })));
  if (repaired) addRepair(group, 0.145);
  // 원형의 긴 변 35 cm를 실제 공물(23 cm)과 맞춘다. 어른용 미끼만 1.5배다.
  group.scale.setScalar(scale * 0.66);
  return group;
}
