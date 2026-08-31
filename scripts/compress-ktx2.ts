import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { NodeIO, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const run = promisify(execFile);

/**
 * GLB 안 WebP/PNG를 KHR_texture_basisu KTX2로 바꾼다.
 *
 * 사용:
 *   KTX_TOOL=/path/to/toktx node scripts/compress-ktx2.ts public/models/mio.glb
 * 출력:
 *   public/models/mio-ktx2.glb
 *
 * 원본은 폴백용으로 그대로 둔다. 색 텍스처는 ETC1S 최고 품질, 노멀은 블록 깨짐을 피하려
 * UASTC+RDO를 쓴다. 둘 다 mipmap을 파일에 포함하므로 런타임 mip 생성과 RGBA 업로드를 피한다.
 */

const tool = process.env['KTX_TOOL'] || 'toktx';
const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error('압축할 GLB 경로를 하나 이상 지정하세요.');

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

const isSrgbName = (texture: Texture) =>
  /base.?color|albedo|diffuse|(^|[_+])color([_.+]|$)/i.test(texture.getName());

for (const input of inputs) {
  const document = await io.read(input);
  const root = document.getRoot();
  const materials = root.listMaterials();
  const scratch = await mkdtemp(path.join(tmpdir(), 'higanbana-ktx2-'));
  try {
    const textures = root.listTextures();
    for (let i = 0; i < textures.length; i++) {
      const texture = textures[i]!;
      const image = texture.getImage();
      if (!image || texture.getMimeType() === 'image/ktx2') continue;
      const usedAsColor = materials.some((material) =>
        material.getBaseColorTexture() === texture || material.getEmissiveTexture() === texture);
      const srgb = usedAsColor || isSrgbName(texture);
      const normal = materials.some((material) => material.getNormalTexture() === texture)
        || /normal|nor[_+. -]?gl/i.test(texture.getName());
      const png = path.join(scratch, `${i}.png`);
      const ktx = path.join(scratch, `${i}.ktx2`);
      await sharp(image).png().toFile(png);

      const args = normal
        ? ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '0.45', '--uastc_rdo_m', '--zcmp', '15']
        : ['--encode', 'etc1s', '--clevel', '3', '--qlevel', '255'];
      // ETC1S 최고 품질(q255)은 유지하되 네 스레드로 빌드 시간을 제한한다. clevel은 탐색 시간과
      // 파일 크기의 절충값이지 런타임 GPU 포맷/해상도를 바꾸지 않는다.
      args.push('--threads', '4', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear', ktx, png);
      await run(tool, args, { maxBuffer: 16 * 1024 * 1024 });
      texture.setImage(await readFile(ktx));
      texture.setMimeType('image/ktx2');
      console.info(`[ktx2] ${path.basename(input)} ${i + 1}/${textures.length} ${texture.getName()} (${srgb ? 'sRGB' : 'linear'}${normal ? ', normal UASTC' : ', ETC1S'})`);
    }

    // 원본 문서가 WebP 확장을 선언하고 있어도 모든 texture source를 KTX2로 교체한 뒤에는
    // 남겨 두지 않는다. 두 확장이 동시에 required면 WebP를 못 읽는 구형 브라우저가 KTX2가
    // 있어도 문서를 거부할 수 있다.
    for (const extension of root.listExtensionsUsed()) {
      if (extension.extensionName === 'EXT_texture_webp') extension.dispose();
    }
    document.createExtension(KHRTextureBasisu).setRequired(true);
    const parsed = path.parse(input);
    const output = path.join(parsed.dir, `${parsed.name}-ktx2.glb`);
    await io.write(output, document);
    console.info(`[ktx2] wrote ${output}`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
