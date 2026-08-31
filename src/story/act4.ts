import * as THREE from 'three';
import { L } from '@/core/i18n';

const MIO = L('미오', 'ミオ');
const BROADCAST = L('방송', '放送');
import type { Dialogue } from './dialogue';
import type { Sfx } from '@/audio/sfx';
import type { Speakers } from '@/world/higasato/speaker';
import type { Phone } from './phone';

/**
 * ACT 4 「끝나지 않은 축제」 — 마을 방송 (PLAN-STORY §2.4)
 *
 * 스토리보드에서 이 ACT 는 두 부분이다. **생활 흔적**은 월드에 상시로 놓여 있고
 * (`world/higasato/lifesigns.ts` — 걷다가 하나씩 스친다), 여기 있는 건 **방송** 하나다.
 *
 * 방송을 굳이 스크립트로 두는 이유: 이건 마을에서 유일하게 *마을이 플레이어에게 말을 거는* 순간이고,
 * 「금일 피안제는 예정대로 진행됩니다」는 **10년 전 날짜와 짝을 이뤄야만** 의미가 생긴다.
 * 그래서 방송이 끝난 뒤 공고판(날짜)이 조사 대상으로 남는다 — 소리가 먼저, 물증이 나중.
 *
 * 조작은 뺏지 않는다(A등급). 플레이어는 방송을 들으며 계속 걸을 수 있고,
 * 그게 더 낫다 — 폐허를 걷는 동안 머리 위에서 안내방송이 나오는 게 이 장면이다.
 */

export interface Act4Deps {
  speakers: Speakers;
  dialogue: Dialogue;
  sfx: Sfx;
  /** 컨트롤러 위치 (참조) */
  player: THREE.Vector3;
  /** 「전기가 죽는다」 ③ — 마을에 닿았을 때 시계가 그대로다 */
  phone: Phone;
  /** 지금 방송을 켜도 되는가 — ACT 3 가 진행 중이면 기다린다 (자막이 겹친다) */
  ready: () => boolean;
  onDone: () => void;
}

interface Beat { at: number; run: (d: Act4Deps, s: Act4) => void }

/**
 * 버스 종점에서 금줄 안쪽으로 인계된 자리까지 포함하는 입구 구간.
 * 돌비석은 z 72에 있으므로 z 92부터 방송을 시작해야, 하차 → 방송 완료 → 비석 활성화 순서가 된다.
 */
const VILLAGE = { x0: -24, x1: 44, z0: -8, z1: 92 };

export class Act4 {
  private state: 'idle' | 'run' | 'done' = 'idle';
  private t = 0;
  private fired = new Set<number>();
  private beats: Beat[];
  private horn = new THREE.Vector3();

  constructor(private d: Act4Deps) {
    // 방송의 원점은 **그때 가장 가까운 나팔**이다. 마을 초입에서 들으면 머리 위에서,
    // 광장 쪽에서 들으면 광장에서 난다 — 스피커가 여러 개인 마을은 그렇게 들린다
    const at = (s: Act4) => { s.horn.copy(s.d.speakers.nearestHorn(s.d.player)); return s.horn; };
    this.beats = [
      // 「갑자기 마을 스피커가 켜진다」 — 켜지는 소리가 먼저다. 이 「틱」이 고개를 들게 만든다
      { at: 0.0, run: (d, s) => { const h = at(s); d.sfx.paOn(h.x, h.y, h.z); } },
      { at: 0.9, run: (d, s) => { const h = at(s); d.sfx.paChime(h.x, h.y, h.z, 0.5); } },
      { at: 3.3, run: (d, s) => {
        const h = at(s);
        d.sfx.paVoice(h.x, h.y, h.z, 10);
        void d.dialogue.say({ who: BROADCAST, text: L('주민 여러분께 알려드립니다.', '住民の皆様にお知らせします。'), dur: 3.0 });
      } },
      // 「심한 잡음.」 — 자막으로 적지 않는다. 잡음은 들리면 그만이고, 자막은 그 자리를 비워 둬야
      // 다음 문장이 무겁게 떨어진다
      { at: 6.6, run: (d, s) => { const h = at(s); d.sfx.paNoise(h.x, h.y, h.z, 1.3, 0.6); } },
      { at: 8.2, run: (d, s) => {
        const h = at(s);
        d.sfx.paVoice(h.x, h.y, h.z, 13);
        void d.dialogue.say({ who: BROADCAST, text: L('금일 피안제는 예정대로 진행됩니다.', '本日の彼岸祭は予定どおり執り行われます。'), dur: 3.4 });
      } },
      // 방송은 페이드로 끝나지 않는다 — 뚝 끊긴다
      { at: 12.2, run: (d) => d.sfx.paOff() },
      { at: 13.6, run: (d) => { d.sfx.voice(0.4, 'girl'); void d.dialogue.say({ who: MIO, text: L('피안제……?', '彼岸祭……?'), dur: 2.6 }); } },
      // 「멀리 신사에서 종소리가 한 번 울린다」 — 마을 북쪽 끝, 아직 가보지 않은 곳에서
      { at: 17.0, run: (d) => { d.sfx.bell(0.55, 1); void d.dialogue.say({ text: L('멀리 신사에서 종소리가 한 번 울렸다.', '遠くの社で、鐘が一度鳴った。'), dur: 3.2 }); } },
      // --- 폰 ③ (각색 6 C안 / P1-1) — 「전기가 죽는다」의 결론 ---
      // 버스에서 본 것과 **같은 숫자**다. 그런데 그때는 오후였고 지금은 해가 넘어갔다.
      // 숫자를 자막으로 다시 읽어 주지 않는다 — 화면에 떠 있는 걸 또 읽으면 연출이 설명이 된다.
      // 하늘이 증인이고, 미오의 한 줄이 그걸 가리킨다.
      { at: 20.6, run: (d) => d.phone.show('lock') },
      { at: 22.4, run: (d) => { d.sfx.voice(0.4, 'girl'); void d.dialogue.say({ who: MIO, text: L('……아직 세 시 사 분?', '……まだ三時四分?'), dur: 2.4 }); } },
      { at: 25.2, run: (d) => void d.dialogue.say({ text: L('해는 벌써 넘어갔다.', '陽はとうに落ちている。'), dur: 2.4 }) },
      { at: 28.0, run: (d) => d.phone.hide() },
      { at: 29.4, run: (_d, s) => s.finish() },
    ];
  }

  get running() { return this.state === 'run'; }
  get done() { return this.state === 'done'; }

  /**
   * QA — 방송 전체를 건너뛴다(디버그 전용). 비트를 하나도 재생하지 않고 곧장 done 으로:
   * `?debug&skip=intro` 는 프롤로그를 건너뛰는 모드인데 첫 마을 방송(약 40초)이 그대로 남아
   * 있어서, 반복 검증 때마다 방송이 끝나기를 기다려야 비석·퀘스트가 열렸다.
   * `finish()` 를 그대로 쓰지 않는 이유: 거긴 paOff 를 부른다 — 켠 적 없는 방송을 끄는 소리가 난다.
   */
  skip() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.d.onDone();
  }
  /** DEV */
  get time() { return this.t; }

  update(dt: number, player: THREE.Vector3) {
    if (this.state === 'idle') {
      // 버스에서 내려 금줄 안쪽으로 인계되는 순간 방송을 먼저 시작한다.
      // 비석은 이 방송의 마지막 코멘트가 끝난 뒤 main 쪽 게이트가 별도로 연다.
      const inside = player.x > VILLAGE.x0 && player.x < VILLAGE.x1 && player.z > VILLAGE.z0 && player.z < VILLAGE.z1;
      if (inside && this.d.ready()) { this.state = 'run'; this.t = 0; }
      return;
    }
    if (this.state !== 'run') return;
    this.t += dt;
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i]!;
      if (this.t >= b.at && !this.fired.has(i)) { this.fired.add(i); b.run(this.d, this); }
    }
  }

  private finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.d.sfx.paOff();   // 멱등 — 이미 꺼져 있으면 아무 일도 없다
    this.d.onDone();
  }
}
