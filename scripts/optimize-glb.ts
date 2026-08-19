/**
 * 단일 GLB 최적화 (텍스처 WebP + meshopt + 애니 리샘플)
 *   node scripts/optimize-glb.ts --in assets/mixamo/out/character_mixamo.glb --out public/models/character.glb [--tex 2048]
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, reorder, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseArgs, ROOT } from './tripo/lib.ts';

const a = parseArgs();
const inPath = resolve(ROOT, String(a['in'] ?? 'assets/mixamo/out/character_mixamo.glb'));
const outPath = resolve(ROOT, String(a['out'] ?? 'public/models/character.glb'));
const texSize = Number(a['tex'] ?? 2048);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inPath);
const root = doc.getRoot();
console.log(`in: anims [${root.listAnimations().map((x) => x.getName()).join(', ')}], meshes ${root.listMeshes().length}, textures ${root.listTextures().length}`);
await doc.transform(
  unpartition(), prune(), dedup(), resample({ tolerance: 1e-4 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 85 }),
  reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune(),
);
const glb = await io.writeBinary(doc);
writeFileSync(outPath, glb);
console.log(`✓ ${outPath.replace(ROOT + '/', '')} — ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB, anims ${root.listAnimations().length}`);
