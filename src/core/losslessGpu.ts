import * as THREE from 'three';

/**
 * 화면 결과를 바꾸지 않고 표준 재질의 낭비만 줄인다.
 *
 * three r185 의 point-light 루프는 광원 반경 밖이라 `directLight.color == 0` 인 픽셀에서도
 * GGX specular + Lambert BRDF 를 끝까지 계산한다. 히가사토는 유효 반경이 짧은 등불이 대부분이라
 * 화면의 대다수 픽셀이 이 경우다. `getPointLightInfo()` 가 이미 산출한 `visible` 로 감싸면 더하는 값은
 * 똑같이 0이고, 비싼 BRDF·그림자 샘플만 건너뛴다. 해상도·빛·그림자 결과는 변하지 않는다.
 */
export function installPointLightEarlyOut() {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunks['lights_fragment_begin'];
  if (!src || src.includes('HIGASATO_POINT_LIGHT_EARLY_OUT')) return;

  const pointStart = src.indexOf('#if ( NUM_POINT_LIGHTS > 0 )');
  const pointEnd = src.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )', pointStart);
  if (pointStart < 0 || pointEnd < 0) {
    console.warn('[gpu] point-light 셰이더 청크를 찾지 못해 early-out을 생략합니다');
    return;
  }

  const before = src.slice(0, pointStart);
  let block = src.slice(pointStart, pointEnd);
  const openNeedle = '\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );';
  const closeNeedle = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (!block.includes(openNeedle) || !block.includes(closeNeedle)) {
    console.warn('[gpu] three 셰이더 형식이 달라 point-light early-out을 생략합니다');
    return;
  }

  block = block
    .replace(openNeedle, `${openNeedle}\n\n\t\t// HIGASATO_POINT_LIGHT_EARLY_OUT\n\t\tif ( directLight.visible ) {`)
    .replace(closeNeedle, `\t${closeNeedle}\n\n\t\t}`);
  chunks['lights_fragment_begin'] = before + block + src.slice(pointEnd);
}

/**
 * 불투명 물체를 앞에서 뒤로 거칠게 정렬해 early-Z가 가려진 픽셀 셰이더를 실행하지 않게 한다.
 * 같은 깊이 띠 안에서는 재질 순서를 유지해 상태 전환 증가를 제한한다. 투명 물체 정렬은 건드리지 않는다.
 * 깊이 테스트 결과가 같은 불투명 패스만 재배열하므로 최종 색은 동일하다.
 */
export function installFrontToBackOpaqueSort(renderer: THREE.WebGLRenderer) {
  const DEPTH_BANDS = 96;
  renderer.setOpaqueSort((a: any, b: any) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    const az = Math.floor((a.z + 1) * 0.5 * DEPTH_BANDS);
    const bz = Math.floor((b.z + 1) * 0.5 * DEPTH_BANDS);
    if (az !== bz) return az - bz;
    if (a.material.id !== b.material.id) return a.material.id - b.material.id;
    if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  });
}
