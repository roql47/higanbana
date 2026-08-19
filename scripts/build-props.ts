/**
 * Tripo 소품 GLB → 웹용 최적화 (WebP 1K + meshopt)
 *   node scripts/build-props.ts [--tex 1024] [--quality 82] [--only prop-tree-oak,prop-rock-mossy]
 * 입력: assets/tripo/prop-XXX/model_url.glb → 출력: public/models/props/XXX.glb
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, reorder, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseArgs, ROOT } from './tripo/lib.ts';

const a = parseArgs();
const texSize = Number(a['tex'] ?? 1024);
const quality = Number(a['quality'] ?? 82);
const only = a['only'] ? String(a['only']).split(',') : null;

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outDir = resolve(ROOT, 'public/models/props');
mkdirSync(outDir, { recursive: true });

const names = readdirSync(resolve(ROOT, 'assets/tripo')).filter((n) => n.startsWith('prop-') && (!only || only.includes(n)));
for (const name of names) {
  const src = resolve(ROOT, 'assets/tripo', name, 'model_url.glb');
  if (!existsSync(src)) { console.log(`- ${name}: model_url.glb 없음, 건너뜀`); continue; }
  const doc = await io.read(src);
  await doc.transform(
    unpartition(),
    dedup(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    prune(),
  );
  const glb = await io.writeBinary(doc);
  const out = resolve(outDir, `${name.replace(/^prop-/, '')}.glb`);
  writeFileSync(out, glb);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(`✓ ${name} → ${out.replace(ROOT + '/', '')} ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris} tris`);
}
