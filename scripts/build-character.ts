/**
 * Tripo 산출물(리깅 GLB + 클립별 GLB) → 웹용 단일 GLB
 *
 *   node scripts/build-character.ts --base assets/tripo/final-tripo/rig/model_url.glb \
 *        --clips assets/tripo/final-tripo/anim --out public/models/character.glb [--tex 2048] [--quality 85]
 *
 * - 클립 GLB 에서 애니메이션만 가져와 base 스켈레톤(같은 본 이름)에 다시 연결
 * - 텍스처 WebP 리사이즈, 애니메이션 리샘플, meshopt 압축
 */
import { readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, simplify, textureCompress, meshopt, reorder, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseArgs, ROOT } from './tripo/lib.ts';

const a = parseArgs();
const basePath = resolve(ROOT, String(a['base'] ?? 'assets/tripo/final-tripo/rig/model_url.glb'));
const clipsDir = resolve(ROOT, String(a['clips'] ?? 'assets/tripo/final-tripo/anim'));
const outPath = resolve(ROOT, String(a['out'] ?? 'public/models/character.glb'));
const texSize = Number(a['tex'] ?? 2048);
// 회전만 사용할 클립(예: Mixamo 리타게팅 결과). 위치/스케일 채널을 버리고
// 루트(Hip) 위치는 Tripo 클립 규약(≈0)으로 고정한다 — 안 그러면 캐릭터가 rest 오프셋만큼 떠오른다.
const rotOnly = new Set(String(a['rot-only'] ?? 'sword_combo').split(',').map((x) => x.trim()).filter(Boolean));
const HIP_BONES = ['Hip', 'Hips', 'mixamorig:Hips'];
const quality = Number(a['quality'] ?? 85);
// 정점 감축 비율 (0 = 안 함). 여우 요괴처럼 face_limit 없이 생성돼 정점이 수십만 개인 모델용
const simplifyRatio = Number(a['simplify'] ?? 0);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(basePath);
const baseScene = doc.getRoot().listScenes()[0]!;
const baseNodesByName = new Map<string, Node>();
baseScene.traverse((n) => { if (n.getName()) baseNodesByName.set(n.getName(), n); });
console.log(`base: ${basename(basePath)} — nodes ${doc.getRoot().listNodes().length}, anims ${doc.getRoot().listAnimations().length}`);

const clipFiles = readdirSync(clipsDir).filter((f) => f.endsWith('.glb')).sort();
for (const f of clipFiles) {
  const clipName = f.replace(/\.glb$/, '');
  const src = await io.read(resolve(clipsDir, f));
  const before = new Set(doc.getRoot().listAnimations());
  const beforeScenes = new Set(doc.getRoot().listScenes());
  mergeDocuments(doc as Document, src);
  const merged = doc.getRoot().listAnimations().filter((an) => !before.has(an));
  let retargeted = 0, missing = 0;
  for (const an of merged) {
    an.setName(clipName);
    if (rotOnly.has(clipName)) {
      let hipNode: Node | null = null;
      for (const ch of an.listChannels()) {
        const path = ch.getTargetPath();
        const node = ch.getTargetNode();
        if (path === 'rotation') continue;
        if (path === 'translation' && node && HIP_BONES.includes(node.getName())) hipNode = node;
        ch.dispose();
      }
      // Hip 위치를 0 으로 고정하는 상수 트랙 추가
      if (hipNode) {
        const dur = an.listSamplers()[0]?.getInput()?.getMax([0])[0] ?? 1;
        const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, dur]));
        const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 0, 0]));
        const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
        an.addSampler(sampler);
        an.addChannel(doc.createAnimationChannel().setTargetNode(hipNode).setTargetPath('translation').setSampler(sampler));
      }
      console.log(`    (rotation-only: 위치/스케일 채널 제거, Hip 위치 0 고정)`);
    }
    for (const ch of an.listChannels()) {
      const tn = ch.getTargetNode();
      const name = tn?.getName() ?? '';
      const target = baseNodesByName.get(name);
      if (target) { ch.setTargetNode(target); retargeted++; }
      else { missing++; ch.dispose(); }
    }
  }
  // 병합으로 들어온 씬(지오메트리 복제본) 제거
  for (const sc of doc.getRoot().listScenes()) {
    if (beforeScenes.has(sc)) continue;
    const nodes: Node[] = [];
    sc.traverse((n) => nodes.push(n));
    sc.dispose();
    for (const n of nodes) n.dispose();
  }
  console.log(`  + ${clipName}: ${merged.length} anim, channels retargeted ${retargeted}, dropped ${missing}`);
}

await MeshoptSimplifier.ready;
await doc.transform(
  unpartition(),
  prune(),
  dedup(),
  ...(simplifyRatio > 0 ? [simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.0008 })] : []),
  resample({ tolerance: 1e-4 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality }),
  reorder({ encoder: MeshoptEncoder }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  prune(),
);

const root = doc.getRoot();
console.log(`out: anims [${root.listAnimations().map((x) => x.getName()).join(', ')}], textures ${root.listTextures().length}, meshes ${root.listMeshes().length}, skins ${root.listSkins().length}`);
const glb = await io.writeBinary(doc);
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync(resolve(outPath, '..'), { recursive: true });
writeFileSync(outPath, glb);
console.log(`✓ ${outPath.replace(ROOT + '/', '')} — ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`);
