import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { L } from '@/core/i18n';
import { Props } from '@/world/props';
import { makeHiganbanaFlower } from '@/world/village/higanbana';
import { manorMaterials, manorBox, batchManorCraft } from './manorCraft';

/** ACT 18 uses shared offering prototypes; moving them never grants or consumes inventory. */
export class CryptRevelationProps {
  readonly group = new THREE.Group();
  readonly traces: THREE.Vector3[];
  readonly encounterPos: THREE.Vector3;
  private figure = new THREE.Group();
  private fallback = new THREE.Group();
  private arm = new THREE.Group();
  private gestureAmount = { value: 0 };
  private word: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private offerings = Array.from({ length: 5 }, () => new THREE.Group());
  private hangingRoots: THREE.InstancedMesh;
  private rootDummy = new THREE.Object3D();
  private rootFrom = new THREE.Vector3();
  private rootTo = new THREE.Vector3();
  private rootDirection = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private descent = 0;
  private targetYaw = Math.PI;
  private gesture = false;
  private loading: Promise<void> | null = null;
  private mountedOfferings = false;

  constructor(parent: THREE.Group, floorY: number, gatePos: THREE.Vector3) {
    this.group.name = 'crypt-revelation'; parent.add(this.group);
    const { x, z } = gatePos, y = floorY;
    const { dark, wood, cloth } = manorMaterials();
    this.encounterPos = new THREE.Vector3(x, y + 0.4, z + 1.1);
    this.traces = [new THREE.Vector3(x + 0.93, y + 0.85, z + 6),
      new THREE.Vector3(x - 2.25, y + 1.05, z + 0.8), new THREE.Vector3(x + 2.1, y + 0.18, z + 0.5)];
    const roots: THREE.BufferGeometry[] = [];
    // Five distinct ceiling roots continue along the corridor and terminate around the door.
    for (let i = 0; i < 5; i++) {
      const side = i % 2 ? -1 : 1, xx = x + side * (0.82 + (i % 3) * 0.07);
      roots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(xx, y + 2.52, z + 10.6), new THREE.Vector3(xx, y + 2.42, z + 6.3),
        new THREE.Vector3(xx + side * 0.03, y + 0.8 + i * 0.16, z + 6),
        new THREE.Vector3(xx, y + 2.4, z + 3.5), new THREE.Vector3(x + (i - 2) * 0.84, y + 2.48, z - 1.35),
      ]), 26, 0.024 + i * 0.004, 5, false));
    }
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? -1 : 1;
      roots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(x + side * 2.9, y + 0.08, z + 1.3 - i * 0.22),
        new THREE.Vector3(x + side * 2.85, y + 1.1, z + 0.3 - i * 0.16),
        new THREE.Vector3(x + side * 1.5, y + 2.55, z - 1.4),
      ]), 10, 0.018 + i % 3 * 0.009, 5, false));
    }
    const rootMesh = new THREE.Mesh(mergeGeometries(roots)!, dark); roots.forEach(g => g.dispose());
    rootMesh.name = 'crypt-five-root-paths'; rootMesh.receiveShadow = true; this.group.add(rootMesh);

    // The traces are visible objects: detached writing and an empty root cradle.
    const writing = (text: string, width: number) => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const c = cv.getContext('2d')!; c.clearRect(0, 0, 512, 128); c.font = 'bold 42px serif';
      c.textAlign = 'center'; c.fillStyle = '#d5ad87'; c.fillText(text, 256, 79, 490);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.03, depthWrite: false,
        roughness: 1, side: THREE.DoubleSide, emissive: 0x4b1c0d, emissiveMap: t, emissiveIntensity: 0.35 });
      return new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
    };
    const traceWord = writing(L('공물을 찾아라', '供物を探せ'), 1.2);
    traceWord.position.copy(this.traces[1]!); traceWord.rotation.y = 0.7; this.group.add(traceWord);
    const cradle = new THREE.Group(); cradle.name = 'crypt-empty-root-cradle'; cradle.position.copy(this.traces[2]!); this.group.add(cradle);
    manorBox(cradle, [0.84, 0.045, 0.55], [0, -0.15, 0], wood);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.053, 0.009, 5, 10), dark);
      ring.rotation.x = -Math.PI / 2; ring.position.set((i - 2) * 0.145, -0.119, 0.05); cradle.add(ring);
    }

    this.figure.name = 'higannushi'; this.figure.position.set(x, y, z - 0.9);
    this.figure.rotation.y = Math.PI; this.figure.visible = false; this.group.add(this.figure);
    // Sculpted cloth fallback stays present if the late character load fails.
    const skirt = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.31, 0.01), new THREE.Vector2(0.28, 0.45), new THREE.Vector2(0.2, 0.92),
      new THREE.Vector2(0.24, 1.27), new THREE.Vector2(0.12, 1.47),
    ], 12), cloth);
    this.fallback.add(skirt); this.figure.add(this.fallback);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), dark);
    mask.scale.set(0.8, 1.05, 0.7); mask.position.set(0, 1.59, 0.11); this.figure.add(mask);
    const flowerGeo = makeHiganbanaFlower(); flowerGeo.computeBoundingBox();
    const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72,
      side: THREE.DoubleSide, emissive: 0x981021, emissiveIntensity: 0.45 });
    for (let i = 0; i < 3; i++) {
      const flower = new THREE.Mesh(flowerGeo, flowerMat); flower.scale.setScalar(0.47);
      flower.position.set((i - 1) * 0.095, 1.58 - flowerGeo.boundingBox!.max.y * 0.47 + Math.abs(i - 1) * 0.04, 0.22);
      flower.rotation.z = (i - 1) * -0.3; this.figure.add(flower);
    }
    this.arm.position.set(-0.22, 1.24, 0); this.figure.add(this.arm);
    manorBox(this.arm, [0.22, 0.43, 0.25], [-0.12, -0.19, 0], cloth, 0.035);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc3b9a7, roughness: 0.9 }));
    hand.scale.set(0.7, 1.6, 0.7); hand.position.set(-0.12, -0.42, 0.025); this.arm.add(hand);
    this.word = writing(L('마지막 공물을 바쳐라', '最後の供物を捧げよ'), 2.25);
    this.word.name = 'crypt-world-objective'; this.word.position.set(x, y + 2.06, z - 0.5); this.word.visible = false; this.group.add(this.word);
    for (let i = 0; i < this.offerings.length; i++) {
      const p = this.offerings[i]!; p.name = `crypt-offering-${i}`;
      p.position.set(x + (i - 2) * 0.67, y + 2.4, z + (i % 2) * 0.3);
      // The moving carrier is visible even if a particular item model cannot be loaded.
      const root = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.019, 5, 14), dark);
      root.rotation.x = Math.PI / 2; p.add(root); p.visible = false; this.group.add(p);
    }
    // Fifteen short, jointed tendrils share one draw; their matrices change only during descent.
    this.hangingRoots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.017, 1, 5), dark, 15);
    this.hangingRoots.name = 'crypt-hanging-roots'; this.hangingRoots.visible = false;
    this.hangingRoots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.hangingRoots);
    batchManorCraft(cradle); batchManorCraft(this.arm);
  }
  prepare() {
    return this.loading ??= Props.loadNormalized('/models/yokai-well-woman.glb', 1.74, 0.85).then(model => {
      // Lift the actual sleeve and hand together, avoiding an extra block-shaped arm.
      // A shared scalar drives the local vertex bend; no CPU vertex uploads per frame.
      model.traverse(object => {
        const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        if (!mesh.isMesh) return;
        mesh.material.onBeforeCompile = shader => {
          shader.uniforms['cryptGesture'] = this.gestureAmount;
          shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
uniform float cryptGesture;
mat2 cryptSleeveRotation(vec3 p) {
  float weight = smoothstep(0.14, 0.30, -p.x) * smoothstep(0.45, 0.88, p.y);
  float a = -1.1 * cryptGesture * weight;
  return mat2(cos(a), sin(a), -sin(a), cos(a));
}`)
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal.yz = cryptSleeveRotation(position) * objectNormal.yz;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.yz = cryptSleeveRotation(position) * (transformed.yz - vec2(1.26, 0.0)) + vec2(1.26, 0.0);');
        };
        mesh.material.customProgramCacheKey = () => 'crypt-sleeve-v1';
        mesh.geometry.computeBoundingSphere(); mesh.geometry.boundingSphere!.radius += 0.45;
      });
      model.name = 'higannushi-kimono'; this.figure.add(model); this.fallback.visible = false; this.arm.visible = false;
    }).catch(error => { console.warn('[crypt] 인물 실물 로드 실패 — 천 실루엣 유지', error); });
  }
  setStage(stage: 'hidden' | 'waiting' | 'facing' | 'command') {
    this.figure.visible = stage !== 'hidden'; this.targetYaw = stage === 'waiting' ? Math.PI : 0;
    this.gesture = stage === 'command'; this.word.visible = this.gesture;
  }
  setOfferings(models: readonly (THREE.Object3D | null)[]) {
    if (this.mountedOfferings) return; this.mountedOfferings = true;
    models.forEach((m, i) => {
      if (!m || !this.offerings[i]) return;
      m.name = `crypt-carried-model-${i}`; m.position.set(0, 0.025, 0); this.offerings[i]!.add(m);
    });
  }
  setDescent(progress: number) {
    this.descent = THREE.MathUtils.clamp(progress, 0, 1);
    this.hangingRoots.visible = this.descent > 0;
    this.offerings.forEach((p, i) => {
      p.visible = this.descent > 0;
      p.position.y = this.figure.position.y + THREE.MathUtils.lerp(2.4, 0.24 + i % 2 * 0.045, THREE.MathUtils.smoothstep(this.descent, 0, 1));
      for (let j = 0; j < 3; j++) {
        const point = (target: THREE.Vector3, t: number) => target.set(
          p.position.x + Math.sin(t * Math.PI) * (i % 2 ? -0.10 : 0.10),
          THREE.MathUtils.lerp(this.figure.position.y + 2.54, p.position.y + 0.045, t),
          p.position.z + Math.sin(t * Math.PI) * 0.08);
        point(this.rootFrom, j / 3); point(this.rootTo, (j + 1) / 3);
        this.rootDirection.subVectors(this.rootTo, this.rootFrom);
        const length = this.rootDirection.length();
        this.rootDummy.position.copy(this.rootFrom).add(this.rootTo).multiplyScalar(0.5);
        this.rootDummy.quaternion.setFromUnitVectors(this.up, this.rootDirection.normalize());
        this.rootDummy.scale.set(1, length, 1); this.rootDummy.updateMatrix();
        this.hangingRoots.setMatrixAt(i * 3 + j, this.rootDummy.matrix);
      }
    });
    this.hangingRoots.instanceMatrix.needsUpdate = true; this.hangingRoots.computeBoundingSphere();
  }
  update(dt: number) {
    const k = 1 - Math.exp(-dt * 3);
    this.figure.rotation.y = THREE.MathUtils.lerp(this.figure.rotation.y, this.targetYaw, k);
    this.arm.rotation.x = THREE.MathUtils.lerp(this.arm.rotation.x, this.gesture ? -1.15 : 0, k);
    this.gestureAmount.value = THREE.MathUtils.lerp(this.gestureAmount.value, this.gesture ? 1 : 0, k);
    if (this.word.visible) this.word.material.opacity = Math.min(1, this.word.material.opacity + dt);
  }
}
