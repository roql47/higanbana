import * as THREE from 'three';
import { N8AOPostPass } from 'n8ao';

// n8ao 2.0.1의 FullScreenTriangle은 postprocessing.Pass가 아니므로
// 상속받은 Pass.dispose()의 얕은 탐색에서 빠진다. 버전 변경 시 이 목록도 확인한다.
const QUADS = [
  'effectShaderQuad', 'effectCompositerQuad', 'poissonBlurQuad',
  'copyQuad', 'accumulationQuad', 'depthDownsampleQuad', 'depthCopyPass',
] as const;
type QuadResources = Partial<Record<typeof QUADS[number], { material: THREE.Material } | null>>;

/** AO를 끌 때 전용 타깃과 셰이더를 해제하되, 컴포저·씬 소유 자원은 건드리지 않는다. */
export class DisposableAOPass extends N8AOPostPass {
  override dispose() {
    // 입력 깊이는 컴포저 소유다. Pass.dispose()의 Texture 탐색에서 제외한다.
    this.setDepthTexture(null);
    const directResources = new Set(Object.values(this));
    const materials = new Set<THREE.Material>();
    const quads = this as this & QuadResources;
    for (const key of QUADS) {
      const material = quads[key]?.material;
      // 디노이즈 재질처럼 직접 프로퍼티로도 노출된 자원은 super가 해제한다.
      if (material && !directResources.has(material)) materials.add(material);
    }
    for (const material of materials) material.dispose();
    // quad.dispose()는 호출하지 않는다: 모든 N8AO 인스턴스가 같은 삼각형 geometry를 쓴다.
    super.dispose();
  }
}
