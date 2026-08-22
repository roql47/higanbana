import type { Higasato } from '@/world/higasato';
import type { Sequence } from './sequencer';
import type { Quests } from './quests';

/**
 * S0 검증용 데모 시퀀스 (DEV, T 키) — 스택 전체를 한 번에 태운다:
 * 페이드 · 레터박스 · 카메라 스플라인(참배로 상공 → 신사) · 화자별 자막 · 퀘스트 글리치 ·
 * 사요체 미리보기. 본편 컷신 저작 전에 시퀀서가 성립하는지 보는 용도라 내용은 가짜다.
 */
export function buildDemoSeq(village: Higasato, quests: Quests): Sequence {
  const g = village.ground;
  const road = (s: number, h: number): [number, number, number] => {
    const rp = g.roadAt(Math.min(Math.max(s, 3), g.roadLength - 3));
    return [rp.x, g.heightAt(rp.x, rp.z) + h, rp.z];
  };
  const sc = village.shrine.center;
  const shrine: [number, number, number] = [sc.x, village.heightAt(sc.x, sc.z) + 2.2, sc.z];
  const mid = road(g.roadLength * 0.5, 1.5);

  return {
    id: 'demo',
    duration: 15,
    cam: [
      { t: 0, pos: road(10, 15), look: mid },
      { t: 5, pos: road(g.roadLength * 0.45, 5.5), look: shrine },
      { t: 10, pos: road(g.roadLength - 26, 2.4), look: shrine },
      { t: 15, pos: road(g.roadLength - 15, 1.7), look: shrine, fov: 47 },
    ],
    events: [
      { t: 0, fade: 'out', dur: 1.4 },
      { t: 1.2, sub: { who: '???', text: '미오야.' } },
      { t: 3.6, sub: { who: '미오', text: '……언니?' } },
      { t: 6.2, sub: { who: '방송', text: '주민 여러분께 알려드립니다. 금일 피안제는 예정대로 진행됩니다.' } },
      { t: 9.8, fn: () => void quests.glitchTo('나를 꺼내줘', 'gm', 1.4) },
      { t: 12.2, fn: () => void quests.glitchTo('공물을 돌려놓자', 'sayo', 1.0) },
      { t: 13.2, fade: 'in', dur: 1.2 },
      // 데모는 자기 완결로 끝낸다 — 본편에서는 다음 챕터가 검은 화면을 이어받는다
      { t: 14.6, fade: 'out', dur: 0.8 },
    ],
  };
}
