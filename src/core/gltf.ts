import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let ktx2Loader: KTX2Loader | null = null;
let gpuCompressedModels = false;
const announcedModels = new Set<string>();

const COMPRESSED_MODELS = new Map<string, string>([
  ['/models/mio.glb', '/models/mio-ktx2.glb'],
  ['/models/character.glb', '/models/character-ktx2.glb'],
  ['/models/sayo.glb', '/models/sayo-ktx2.glb'],
  ['/models/props/bus-driver-v2.glb', '/models/props/bus-driver-v2-ktx2.glb'],
]);

/**
 * 렌더러가 네이티브 블록 압축 포맷을 하나라도 제공할 때만 KTX2 모델 경로를 켠다.
 * 지원하지 않는 WebView/안전 모드는 원본 WebP GLB를 그대로 읽는다. KTX2를 RGBA로 다시
 * 풀어 쓰는 폴백은 다운로드만 늘고 GPU 메모리 이득이 없으므로 선택하지 않는다.
 */
export function configureGLTFTextureCompression(renderer: THREE.WebGLRenderer, enabled: boolean) {
  const nativeCompression = [
    'WEBGL_compressed_texture_astc',
    'WEBGL_compressed_texture_etc',
    'WEBGL_compressed_texture_etc1',
    'WEBGL_compressed_texture_s3tc',
    'EXT_texture_compression_bptc',
    'WEBGL_compressed_texture_pvrtc',
  ].some((name) => renderer.extensions.has(name));

  gpuCompressedModels = enabled && nativeCompression;
  if (!gpuCompressedModels) {
    ktx2Loader?.dispose();
    ktx2Loader = null;
    console.info('[ktx2] disabled — original WebP model textures');
    return false;
  }

  ktx2Loader?.dispose();
  ktx2Loader = new KTX2Loader()
    .setWorkerLimit(2)
    .detectSupport(renderer);
  console.info('[ktx2] native GPU texture compression enabled');
  return true;
}

export function createGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (ktx2Loader) loader.setKTX2Loader(ktx2Loader);
  return loader;
}

/** 원본 URL은 호환 폴백으로 보존하고, 지원 GPU에서만 별도 KTX2 GLB를 고른다. */
export function preferGpuCompressedModel(url: string) {
  if (!gpuCompressedModels) return url;
  const queryAt = url.indexOf('?');
  const path = queryAt >= 0 ? url.slice(0, queryAt) : url;
  const query = queryAt >= 0 ? url.slice(queryAt) : '';
  for (const [original, compressed] of COMPRESSED_MODELS) {
    if (path === original) {
      if (!announcedModels.has(compressed)) { announcedModels.add(compressed); console.info(`[ktx2] model ${compressed}`); }
      return compressed + query;
    }
    // BASE_URL이 이미 붙은 URL도 처리한다.
    if (path.endsWith(original)) {
      if (!announcedModels.has(compressed)) { announcedModels.add(compressed); console.info(`[ktx2] model ${compressed}`); }
      return path.slice(0, -original.length) + compressed + query;
    }
  }
  return url;
}
