/**
 * Tripo 소품 GLB → 웹용 최적화 (WebP 1K + meshopt)
 *   node scripts/build-props.ts [--tex 1024] [--quality 82] [--only prop-tree-oak,prop-rock-mossy]
 * 입력: assets/tripo/prop-XXX/model_url.glb → 출력: public/models/props/XXX.glb
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, reorder, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { parseArgs, ROOT } from './tripo/lib.ts';

const a = parseArgs();
const texSize = Number(a['tex'] ?? 1024);
const quality = Number(a['quality'] ?? 82);
const only = a['only'] ? String(a['only']).split(',') : null;
/** 0 < ratio < 1 이면 그 비율까지 삼각형을 줄인다 (원거리 소품·다수 인스턴스용) */
const simplifyRatio = a['simplify'] ? Number(a['simplify']) : 0;

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outDir = resolve(ROOT, 'public/models/props');
mkdirSync(outDir, { recursive: true });

const names = readdirSync(resolve(ROOT, 'assets/tripo')).filter((n) => n.startsWith('prop-') && (!only || only.includes(n)));
for (const name of names) {
  // 리깅된 버전이 있으면 그쪽이 우선이다 (스킨·본이 들어 있는 최종본)
  const rigged = resolve(ROOT, 'assets/tripo', name, 'rig', 'model_url.glb');
  const src = existsSync(rigged) ? rigged : resolve(ROOT, 'assets/tripo', name, 'model_url.glb');
  if (!existsSync(src)) { console.log(`- ${name}: model_url.glb 없음, 건너뜀`); continue; }
  if (src === rigged) console.log(`  ${name}: 리깅본 사용`);
  const doc = await io.read(src);
  const skinned = doc.getRoot().listSkins().length > 0;
  // 스킨드 모델에서 Skin 을 지우는 건 **prune 이다**(실측: "Removed types... Skin (1)" → 본이 사라져
  // 날갯짓 불가). weld/simplify 는 조인트를 보존한다 — 다만 error 를 0.001 로 두면 거의 안 줄어든다
  // (5,906 → 4,528 에서 멈춤). 0.01 이면 1,476 까지 내려가고 실루엣도 멀쩡하다.
  await doc.transform(
    unpartition(),
    dedup(),
    weld(),
    ...(simplifyRatio > 0 ? [simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: skinned ? 0.01 : 0.001 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    ...(skinned ? [] : [prune()]),
  );
  if (skinned) console.log(`  ${name}: 스킨드 — prune 생략(Skin 보존)`);
  const glb = await io.writeBinary(doc);
  const out = resolve(outDir, `${name.replace(/^prop-/, '')}.glb`);
  writeFileSync(out, glb);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(`✓ ${name} → ${out.replace(ROOT + '/', '')} ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris} tris`);
}
