import * as THREE from 'three';
import type { Sequencer } from './sequencer';
import type { Dialogue } from './dialogue';
import type { FirstPerson } from './firstPerson';
import type { Pursuers } from './pursuers';
import { Act1 } from './act1';
import { Act2 } from './act2';
import type { Rain } from '@/world/rain';
import type { Lightning } from '@/world/lightning';
import type { Bus } from '@/world/bus';
import type { TimeOfDayName } from '@/world/timeOfDay';
import type { Sfx } from '@/audio/sfx';
import type { Higasato } from '@/world/higasato';
import type { Chochin } from '@/light/chochin';
import type { Phone } from './phone';
import type { CharacterController } from '@/character/controller';
import type { Sayo } from './sayo';

/**
 * 프롤로그 오케스트레이션 (PLAN-STORY §8.4)
 *   ACT 1 「붉은 꽃밭」 — **플레이 가능한** 1인칭 도주 (`act1.ts`)
 *   TITLE 《彼岸花》
 *   ACT 2a 「버스 안」 — 1인칭. 손에 든 사진과 백미러 (`act2.ts`)
 *   ACT 2b 「종점」 — 3인칭 컷신. 내리는 순간 **현재의 미오를 처음 보여준다**
 *
 * 시점이 두 번 바뀐다. ACT 1 은 *누군가의 손을 잡고 달리고 있다* 라서 1인칭이고,
 * ACT 2a 는 *사진이 손에 있다* 라서 1인칭이며, ACT 2b 는 *버스에서 내렸다 · 돌아보니 길이 없다* —
 * 관찰의 장면이라 카메라가 맡는다. 그 전환 자체가 미오를 소개하는 컷이 된다.
 */
export async function playPrologue(deps: {
  sequencer: Sequencer;
  dialogue: Dialogue;
  village: Higasato;
  controller: CharacterController;
  fp: FirstPerson;
  pursuers: Pursuers;
  /** ACT 1 에서 앞서 달리는 언니 (`story/sayo.ts`). ACT 1 이 끝나면 여기서 정리한다 */
  sayo: Sayo | null;
  rain: Rain;
  /** ACT 1 의 번개 — `rainNight` 에서 앞이 안 보이므로 이것이 유일하게 길을 보여준다 */
  lightning: Lightning;
  /** ACT 2a 의 무대 — 지형 밖에 세운 자립 세트 */
  bus: Bus;
  camera: THREE.PerspectiveCamera;
  sfx: Sfx;
  chochin: Chochin | null;
  phone: Phone;
  /** 아이템을 인벤토리에 넣는다 (가족사진 — ACT 2b 「가방에 넣고」) */
  give: (itemId: string) => void;
  setSurfaceOverride: (s: 'water' | null) => void;
  setDread: (v: number) => void;
  /** 시간대 전환 (world/timeOfDay.ts) */
  setTime: (name: TimeOfDayName, seconds?: number) => void;
  title: (show: boolean) => void;
  /** ACT 1 을 프레임 루프에 물린다 (플레이 구간이라 매 프레임 갱신이 필요하다) */
  bindAct1: (a: Act1 | null) => void;
  bindAct2: (a: Act2 | null) => void;
  place: (p: THREE.Vector3) => void;
  onEnd: (spawn: THREE.Vector3) => void;
}) {
  const { sequencer, dialogue, village, controller, fp, pursuers, rain, lightning, bus, sfx, chochin } = deps;
  const g = village.ground;

  chochin?.setLevel(0);   // 10년 전 그 밤에는 등불이 없다
  // ACT 1 은 **비 오는 밤** — 구름이 달을 먹어 별이 없고 안개가 두껍다
  deps.setTime('rainNight');

  // ---------------- ACT 1 ----------------
  const act1 = new Act1({
    village, controller, fp, pursuers, dialogue, sequencer, rain, lightning, sfx,
    sayo: deps.sayo,
    setSurfaceOverride: deps.setSurfaceOverride,
    setDread: deps.setDread,
  });
  deps.bindAct1(act1);
  await act1.play();
  deps.bindAct1(null);
  // 언니는 ACT 1 에서만 나온다 — 여기서 GPU 메모리를 돌려준다(2 K 텍스처 3장 + 88 k 삼각형).
  // ACT 29 의 탈출 런(이번엔 미오가 앞)에 다시 필요해지면 그때 다시 읽는다
  deps.sayo?.dispose();

  // ---------------- TITLE ----------------
  deps.title(true);
  await wait(3200);   // 한자 등장 애니메이션(2.4 s)이 끝나고 잠깐 머무는 시간
  deps.title(false);
  await wait(700);

  // ---------------- ACT 2a 「버스 안」 ----------------
  // 스토리보드 ACT 2 는 여기서 시작한다 — 창가에 앉아 사진을 보는 미오, 그리고 기사.
  // 시간대를 먼저 걸어 둔다: 창밖이 오후 3시여야 한다
  deps.setTime('afternoon');
  chochin?.setLevel(0);
  const act2 = new Act2({ bus, fp, dialogue, sequencer, sfx, phone: deps.phone, camera: deps.camera });
  deps.bindAct2(act2);
  await act2.play();
  deps.bindAct2(null);
  await wait(600);

  // ---------------- ACT 2b 「종점」 ----------------
  // 여기서 3인칭으로 바뀐다. 문이 열리고 내려서는 순간이 **현재의 미오를 처음 보여주는** 컷이다
  const stop = village.busStop.pos;
  const stand = new THREE.Vector3(stop.x + 1.6, g.heightAt(stop.x + 1.6, stop.z + 1.2) + 0.05, stop.z + 1.2);
  deps.place(stand);
  // 게이트 **너머**로 이어지는 흙길. 게이트 자체를 보면 정류장에서 3 m 앞이라 기둥이 화면을 가른다 —
  // 「그 자리에는 오래된 흙길과 빽빽한 삼나무 숲만 남아 있다」는 그 너머를 봐야 성립한다
  const far1 = g.roadAt(16), far2 = g.roadAt(30);
  sfx.setRain(false);
  // **오후 3시**에 도착한다.
  //
  // 밝은 데서 시작해야 「버스가 없다 · 아스팔트 도로도 사라졌다」와 **해가 사라진다**가
  // 같은 사건이 된다. 24 초 만에 오후 3시에서 저녁이 되는 건 물리적으로 불가능하고, 그게 요점이다 —
  // 히가사토가 현실에서 떨어져 나가는 순간을 조명이 같이 말해 준다.
  // 다만 **밤까지는 가지 않는다**(`evening`) — 여기가 이 게임의 기본 조도다.

  await sequencer.play({
    id: 'act2-terminus',
    duration: 24,
    letterbox: true,
    cam: [
      // 정류장 표지와 미오를 함께 — 내린 직후, 버스가 떠난 남쪽을 본다
      { t: 0, pos: [stand.x + 3.4, stand.y + 1.9, stand.z + 4.6], look: [stand.x, stand.y + 1.3, stand.z], fov: 50 },
      { t: 7, pos: [stand.x + 2.6, stand.y + 1.7, stand.z + 3.4], look: [stand.x - 0.3, stand.y + 1.2, stand.z - 0.6], fov: 52 },
      // 옆으로 돌아 나가며 "도로가 있어야 할 자리"를 비운 채 보여준다
      { t: 13, pos: [stand.x - 3.8, stand.y + 1.8, stand.z + 2.6], look: [stand.x + 1.2, stand.y + 1.2, stand.z + 1.0], fov: 52 },
      // 마을 쪽(북)으로 — 금줄 게이트를 앞에 두고 그 너머 흙길이 삼나무 숲으로 빨려 들어간다
      { t: 18, pos: [stand.x - 2.4, stand.y + 2.2, stand.z + 3.0], look: [far1.x, g.heightAt(far1.x, far1.z) + 1.6, far1.z], fov: 50 },
      // 마지막은 **빈 길** 하나. 정류장 표지 북쪽·서쪽으로 빠져야 표지판이 화면을 막지 않는다
      // (표지는 정류장 기둥 위 2.4 m 라 바로 남쪽에서 북을 보면 정확히 한가운데에 선다 — 실제로 그랬다).
      // 미오는 프레임 밖이다. 「……사람을 찾으러 왔어요」가 **아무도 없는 길 위로** 얹힌다
      { t: 24, pos: [stand.x - 3.2, stand.y + 2.3, stand.z - 0.5], look: [far2.x, g.heightAt(far2.x, far2.z) + 1.8, far2.z], fov: 46 },
    ],
    events: [
      { t: 0, fade: 'out', dur: 1.8 },
      { t: 1.0, sub: { text: '미오가 내린다. 버스 문이 닫히고 차량이 출발한다.', dur: 3.4 } },
      // 「사진을 가방에 넣고」 — **그 줄에서 아이템이 된다**. 자막이 말한 것과 인벤의 상태가
      // 같은 순간에 맞아야 물건이 손에 들어온 게 된다 (PLAN-STORY P2)
      { t: 5.4, sub: { text: '사진을 가방에 넣고 뒤를 돌아본다.', dur: 3.0 } },
      { t: 6.0, fn: () => deps.give('photo') },
      { t: 12.4, sub: { text: '버스가 없다. 아스팔트 도로도 사라졌다.', dur: 3.4 } },
      { t: 16.4, sub: { text: '그 자리에는 오래된 흙길과 빽빽한 삼나무 숲만 남아 있다.', dur: 4.0 } },
      { t: 21.0, sub: { who: '미오', text: '……사람을 찾으러 왔어요.', dur: 3.0 } },
      // **해가 무너진다.** 두 단계로 간다 — 오후에서 밤으로 곧장 보간하면 색이 그냥 어두워질 뿐,
      // 노을을 지나가지 않아 "저녁이 왔다"로 안 읽힌다. 3시 → 저녁 → 밤.
      // 시작은 미오가 **뒤를 돌아보는 줄**(t 8.4) — 돌아보는 동안 등 뒤에서 해가 진다
      { t: 8.4, fn: () => deps.setTime('dusk', 6) },
      // **밤까지 가지 않는다** — 늦은 저녁에서 멈춘다(사용자 지시). 해는 갔지만 하늘에 빛이 남아 있고,
      // 그 밝기가 이 게임의 기본 조도다. 캄캄해지면 ACT 4 의 생활 흔적이 화면에서 사라진다
      { t: 15.0, fn: () => deps.setTime('evening', 7) },
      // 예전에는 여기서 초칭이 켜졌다. 각색 6 **C안**으로 바뀌면서 그 순간이 옮겨졌다 —
      // 미오는 **빈손으로 내린다.** 등불은 마을 초입 처마에서 직접 떼어 든다
      // (`world/higasato/eaveChochin.ts`). 어두워지는 것만 남긴다
    ],
  });
  // 스킵으로 건너뛰었더라도 인계 시점의 시간대는 고정이다 (보간이 남아 있으면 여기서 끊는다)
  deps.setTime('evening');
  // 레벨은 「강」으로 맞춰 두되 **들지는 않는다** — 처마에서 떼는 순간 바로 밝게 켜져야
  // 「빛을 얻었다」가 한 박자에 읽힌다
  chochin?.setLevel(2);
  chochin?.setHeld(false);

  // 플레이 시작 — 금줄 게이트 안쪽(마을 쪽). 온 길로는 돌아갈 수 없다
  const sp = g.roadAt(9);
  deps.onEnd(new THREE.Vector3(sp.x, g.heightAt(sp.x, sp.z) + 0.05, sp.z));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
