import { L } from '@/core/i18n';
import type { Dialogue } from './dialogue';

/** ACT 14: 완료 전 저장을 불러오면 기억을 다시 보여 준다. 선택은 해석을 남기며 엔딩을 잠그지 않는다. */
export class MirrorMemory {
  private playing: Promise<void> | null = null;
  get busy() { return this.playing !== null; }
  constructor(private deps: {
    evidence: ReadonlySet<string>;
    dialogue: Pick<Dialogue, 'say' | 'choose'>;
    begin: () => void;
    remember: (id: string) => unknown;
  }) {}
  play(): Promise<void> {
    if (this.playing) return this.playing;
    if (this.deps.evidence.has('memory:bell')) return Promise.resolve();
    this.deps.begin();
    this.playing = this.run().finally(() => { this.playing = null; });
    return this.playing;
  }
  private async run() {
    const { dialogue, remember } = this.deps;
    const mio = L('미오', 'ミオ');
    await dialogue.say(
      { text: L('깨진 거울에는 현재의 미오가 아니라 여섯 살 미오가 비친다.', '割れた鏡には、今のミオではなく六歳のミオが映っている。') },
      { text: L('피안제. 사요가 「여기서 기다려」라고 말하고 잠시 자리를 비운다. 기다리던 아이에게 먼저 다가온 것은 목소리였다.', '彼岸祭。サヨは「ここで待ってて」と少し席を外す。待つ子供に先に近づいたのは、声だった。') },
      { who: L('할머니', 'おばあちゃん'), text: L('미오야. 이리 오렴.', 'ミオ。こっちへおいで。') },
      { who: L('어린 미오', '幼いミオ'), text: L('할머니?', 'おばあちゃん？') },
      { text: L('죽은 할머니를 따라 피안화 길을 걷는다. 작은 사당 안에 붉은 방울이 놓여 있다.', '死んだ祖母を追って彼岸花の道を歩く。小さな祠の中に赤い鈴がある。') },
      { who: L('할머니', 'おばあちゃん'), text: L('그걸 가져오렴.', 'それを持っておいで。') },
    );
    const focus = await dialogue.choose(L('기억에서 눈을 떼지 않는다', '記憶から目を逸らさない'), [
      L('방울을 든 내 손을 본다', '鈴を持つ自分の手を見る'), L('할머니의 목소리를 듣는다', '祖母の声を聞く'),
    ]);
    if (focus !== 0 && focus !== 1) return;
    await dialogue.say(
      focus === 0
        ? { text: L('손이 너무 작다. 금줄을 풀 때 걸리던 손가락이 기억난다. 기억 속 손이 떨리자 거울을 쥔 지금의 손도 움츠러든다.', '手があまりに小さい。注連縄を解く時に引っかかった指を覚えている。記憶の手が震えると、鏡を握る今の手もこわばる。') }
        : { text: L('할머니는 내게 어디가 아픈지, 왜 혼자인지 묻지 않는다. 방울을 가져오라는 말만 되풀이한다.', '祖母はどこが痛いのか、なぜ一人なのか訊かない。鈴を持ってこいとだけ繰り返す。') },
      { text: L('댕—. 어린 손이 방울을 드는 순간 할머니의 얼굴이 검게 갈라진다.', 'ゴーン。幼い手が鈴を持ち上げた瞬間、祖母の顔が黒くひび割れる。') },
      { who: mio, text: L('내가…… 가져갔어.', '私が……持っていった。') },
      { who: '???', text: L('그래. 착한 아이였지. 시키는 대로 잘했으니까.', 'そう。いい子だったね。言われたとおりにしたから。') },
      { who: mio, text: L('그때도 방울을 가져오라고 했어. 지금 목표와 똑같이.', 'あの時も鈴を持ってこいと言った。今の目標と同じに。') },
      ...(this.deps.evidence.has('case:inn-waiting:complete') ? [
        { who: mio, text: L('여관에서는 내가 진정할 때까지 기다려 줬어. 언니도, 방을 내준 사람도.', '旅館では、私が落ち着くまで待ってくれた。姉も、部屋を譲ってくれた人も。') },
        { who: mio, text: L('그 목소리는 한 번도 기다려 주지 않았어. 내가 무서운지는 묻지도 않고.', 'あの声は一度も待ってくれなかった。怖いかどうかも訊かずに。') },
      ] : []),
      { who: mio, text: L('내 손이 한 일을 모른 척하진 않을 거야. 하지만 네 말만 듣고 무슨 일이 있었는지 정하지도 않을 거야.', '自分の手がしたことを知らないふりはしない。でも、あなたの言葉だけで何があったか決めもしない。') },
      { who: mio, text: L('그날 남은 기록을 찾겠어. 언니가 왜 돌아오지 못했는지.', 'あの夜の記録を探す。なぜ姉が帰れなかったのか。') },
    );
    remember(`memory:bell-focus-${focus}`);
    remember('memory:bell');
  }
}
