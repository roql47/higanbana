import { L } from '@/core/i18n';
import type { Dialogue, DialogueLine } from './dialogue';

const line = (ko: string, ja: string): DialogueLine => ({ text: L(ko, ja) });
const mio = (ko: string, ja: string): DialogueLine => ({ who: L('미오', 'ミオ'), text: L(ko, ja) });
export const HOLLOW_CLUES = [
  {
    id: 'graveyard:hollow-trail', title: L('돌아오는 발자국', '戻ってくる足跡'),
    prompt: L('흙에 남은 발끝과 뒤꿈치를 살핀다', '土に残る爪先と踵を調べる'),
    lines: [
      line('세 길에 같은 크기의 맨발 자국이 있다. 두 길은 발끝이 안쪽을 향하고, 한 길만 이 문 쪽으로 돌아온다.', '三本の道に同じ大きさの裸足の跡。二本は爪先が奥を向き、一本だけこの門へ戻ってくる。'),
      mio('돌아온 아이는 셋이었어. 여기서는 들어간 자국보다 돌아온 자국을 따라가야 해.', '戻った子は三人だった。ここでは入った跡より、戻ってきた跡を辿ろう。'),
    ],
    summary: L('안으로 유인하는 두 줄과 입구로 돌아오는 한 줄. 발끝의 방향으로 구별할 수 있다.', '奥へ誘う二列と、入口へ戻る一列。爪先の向きで見分けられる。'),
  },
  {
    id: 'graveyard:hollow-pair', title: L('남겨진 왼쪽 게다', '残された左の下駄'),
    prompt: L('남겨진 짝의 끈과 닳은 굽을 살핀다', '残った片方の鼻緒とすり減った歯を調べる'),
    lines: [
      line('작은 왼쪽 게다가 천 위에 놓여 있다. 붉은 끈을 푸른 실로 고쳤고 뒤쪽 굽만 비스듬히 닳았다.', '小さな左の下駄が布に置かれている。赤い鼻緒を青い糸で直し、後ろの歯だけ斜めにすり減っている。'),
      line('천 안쪽에는 「끈 풀리면 누나가 다시 묶어 줄게」. 이름 대신 작은 손자국이 찍혀 있다.', '布の内側に「ほどけたら、お姉ちゃんが結び直す」。名前の代わりに小さな手形がある。'),
      mio('색만 같은 건 짝이 아니야. 고친 매듭과 닳은 자리까지 같은 걸 찾아야 해.', '色が同じだけでは揃わない。直した結びとすり減った所まで同じものを探そう。'),
    ],
    summary: L('원래 짝은 붉은 끈의 푸른 수선 실과 비스듬히 닳은 뒤굽을 가진 작은 게다다.', '本当の片割れは、赤い鼻緒の青い補修糸と斜めにすり減った後ろ歯がある小さな下駄。'),
  },
] as const;

export interface GraveyardPassageDeps {
  evidence: ReadonlySet<string>;
  dialogue: Pick<Dialogue, 'say'>;
  remember: (id: string) => unknown;
  inside: () => boolean;
  hasGeta: () => boolean;
  canEnter: () => boolean;
  travel: (to: 'inside' | 'outside' | 'reset') => Promise<void>;
  farewell: () => Promise<void>;
}

/** 공간의 선택을 기록한다. 오답은 입구로 접힐 뿐, 읽은 단서와 맞춘 짝을 지우지 않는다. */
export class GraveyardPassage {
  private playing = false;
  get busy() { return this.playing; }
  get crossed() { return this.d.evidence.has('graveyard:crossed'); }
  get matched() { return this.d.evidence.has('graveyard:hollow-matched') || this.d.evidence.has('graveyard:palm'); }
  get nextClue() { return HOLLOW_CLUES.findIndex(c => !this.d.evidence.has(c.id)); }
  // 진입 페이드 중 저장하면 crossed 기록 직전일 수 있다. 이후 짝을 맞춘 기록도 귀환의 근거다.
  get needsFarewell() { return (this.crossed || this.matched) && this.d.hasGeta() && !this.d.inside() && !this.d.evidence.has('graveyard:palm'); }
  constructor(private d: GraveyardPassageDeps) {}

  private async run(action: () => Promise<void>) {
    if (this.busy) return false;
    this.playing = true;
    try { await action(); return true; } finally { this.playing = false; }
  }

  observeJizo(index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 5 || this.d.inside()) return Promise.resolve(false);
    return this.run(async () => {
      await this.d.dialogue.say(line('얼굴이 길을 향하지 않는다. 턱 아래의 깊은 홈과 모은 두 손이 묘열 안쪽의 한 자리를 향한다.', '顔は道に向いていない。顎の下の深い溝と合わせた両手が、墓列の中の一か所を指している。'));
      this.d.remember(`graveyard:gaze-${index}`);
      const count = Array.from({ length: 6 }, (_, i) => this.d.evidence.has(`graveyard:gaze-${i}`)).filter(Boolean).length;
      if (count >= 2 && !this.d.evidence.has('graveyard:gaze')) {
        await this.d.dialogue.say(mio('다른 자리에 서 있는데 같은 빈 무덤을 보고 있어. 저 앞에 서 보라는 걸까.', '離れた所に立っているのに、同じ空の墓を見ている。あの前に立てということ？'));
        this.d.remember('graveyard:gaze');
      }
    });
  }

  enter() {
    if (this.d.inside() || !this.d.canEnter()) return Promise.resolve(false);
    return this.run(async () => {
      const first = !this.crossed;
      await this.d.travel('inside');
      this.d.remember('graveyard:crossed');
      if (first) await this.d.dialogue.say(
        line('지장들의 시선이 겹치는 자리에 서자 돌끼리 스치는 소리가 난다. 눈을 뜨니 같은 묘석이 천장 없는 마당을 둘러싸고 있다.', '地蔵の視線が重なる場所に立つと、石同士の擦れる音。目を開くと、同じ墓石が天井のない庭を囲んでいる。'),
        line('들어온 문에만 붉은 천이 묶여 있다. 앞에는 세 갈래 발자국과 게다들이 보인다.', '入ってきた門にだけ赤い布が結ばれている。前には三つに分かれる足跡と下駄。'),
        mio('먼저 앞마당의 발자국과 오른쪽 받침대의 왼쪽 게다를 살피자. 그다음 세 길에서 짝을 찾으면 돼.', 'まず前庭の足跡と右の台の左の下駄を調べよう。そのあと三つの道で片割れを探せばいい。'),
        line('이 묘역 안에서는 자유롭게 움직일 수 있다. 지상으로 돌아가려면 들어온 붉은 매듭의 문에서 [E]를 길게 누른다.', 'この墓域の中は自由に歩ける。地上へ戻るには、入ってきた赤い結び目の門で[E]を長押しする。'),
      );
    });
  }

  readClue(index: number) {
    const clue = HOLLOW_CLUES[index];
    if (!clue || !this.d.inside() || this.d.evidence.has(clue.id)) return Promise.resolve(false);
    return this.run(async () => { await this.d.dialogue.say(...clue.lines); this.d.remember(clue.id); });
  }

  inspectGeta(index: number) {
    if (!this.d.inside() || !Number.isInteger(index) || index < 0 || index > 2 || this.d.hasGeta() || this.matched) return Promise.resolve(false);
    return this.run(async () => {
      if (this.nextClue >= 0) {
        await this.d.dialogue.say(mio('누군가 집으라고 밀어 놓은 것 같아. 먼저 발자국 방향과 남겨진 짝을 확인하자.', '誰かが拾えと押し出したみたい。先に足跡の向きと残った片方を確かめよう。'));
        return;
      }
      if (index !== 1) {
        await this.d.dialogue.say(index === 0
          ? line('붉은 끈은 새것이고 굽에는 닳은 자리가 없다. 손을 내밀자 웃음소리가 등 뒤로 옮겨 간다.', '赤い鼻緒は新品で、歯にすり減った所がない。手を伸ばすと笑い声が背後に移る。')
          : line('푸른 실은 있지만 매듭이 풀려 있고 크기도 어른의 것이다. 손가락이 닿기 전에 바닥이 접힌다.', '青い糸はあるが結びが解けていて、大きさも大人のもの。指が触れる前に床が折れる。'));
        await this.d.travel('reset');
        await this.d.dialogue.say(mio('다시 붉은 매듭 앞이야. 수첩의 흔적은 그대로야. 돌아오는 발끝과 고친 짝을 다시 보자.', 'また赤い結び目の前。手帳の痕は消えてない。戻る爪先と直した片割れをもう一度見よう。'));
      } else {
        await this.d.dialogue.say(
          line('이 길의 발끝만 문 쪽을 향한다. 게다의 푸른 수선 실과 닳은 뒤굽도 남겨진 짝과 맞는다.', 'この道だけ爪先が門を向く。下駄の青い補修糸とすり減った後ろ歯も、残った片方と合う。'),
          mio('여기로 돌아오다 벗겨진 거야. 누가 가지라고 놓은 게 아니었어.', 'ここへ戻る途中で脱げたんだ。拾わせるために置いたんじゃなかった。'),
        );
        this.d.remember('graveyard:hollow-matched');
      }
    });
  }

  leave() {
    if (!this.d.inside()) return Promise.resolve(false);
    return this.run(async () => {
      await this.d.dialogue.say(line('목소리들은 다른 문을 부른다. 미오는 처음 보았던 붉은 매듭을 짚는다.', '声は別の門へと呼ぶ。ミオは最初に見た赤い結び目に触れる。'));
      await this.d.travel('outside');
      if (this.needsFarewell) await this.d.farewell();
      if (this.d.hasGeta()) this.d.remember('graveyard:returned');
    });
  }

  falseExit() {
    if (!this.d.inside()) return Promise.resolve(false);
    return this.run(async () => {
      await this.d.dialogue.say(line('문 안에서 언니의 목소리가 들린다. 손을 뻗지만 잡아 주는 손은 없다. 발밑이 다시 접힌다.', '門の中から姉の声。手を伸ばしても、握り返す手はない。足元がまた折れる。'));
      await this.d.travel('reset');
      await this.d.dialogue.say(mio('붉은 매듭은 이쪽에 있었어. 찾아 둔 흔적도 그대로야.', '赤い結び目はこっちだった。見つけた痕も消えてない。'));
    });
  }

  resumeFarewell() {
    if (!this.needsFarewell) return Promise.resolve(false);
    return this.run(async () => { await this.d.farewell(); this.d.remember('graveyard:returned'); });
  }
}
