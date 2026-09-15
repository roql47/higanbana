import { L } from '@/core/i18n';
import type { Dialogue } from './dialogue';
import type { Quests } from './quests';

export type Act17State = 'unseen' | 'pending' | 'complete';

/** 거절 이벤트와 별개로 연출 완료를 저장한다. 구버전 ACT 17 저장은 미완료로 재생한다. */
export class Act17Conclusion {
  state: Act17State = 'unseen';
  private playing: Promise<void> | null = null;
  get running() { return this.playing !== null; }
  constructor(private deps: {
    dialogue: Pick<Dialogue, 'say'>;
    quests: Pick<Quests, 'glitchTo'>;
    wait: (ms: number) => Promise<void>;
    checkpoint: () => void;
    onComplete: () => void;
  }) {}

  restore(state: Act17State | undefined, legacyRefused: boolean) {
    this.state = state ?? (legacyRefused ? 'pending' : 'unseen');
  }
  resume() {
    if (this.state === 'complete') { this.deps.onComplete(); return Promise.resolve(); }
    return this.state === 'pending' ? this.play() : Promise.resolve();
  }
  play(): Promise<void> {
    if (this.playing) return this.playing;
    if (this.state === 'complete') { this.deps.onComplete(); return Promise.resolve(); }
    this.state = 'pending';
    this.deps.checkpoint();
    this.playing = this.run().finally(() => { this.playing = null; });
    return this.playing;
  }
  private async run() {
    const { dialogue, quests, wait } = this.deps;
    await dialogue.say(
      { text: L('봉인패를 받침대의 홈 위에 대 본다. 문양은 이어지지 않고 검은 뿌리만 손 쪽으로 뻗는다.', '封印札を台座の溝にかざす。紋は繋がらず、黒い根だけが手へ伸びる。') },
      { who: L('미오', 'ミオ'), text: L('이걸 위한 자리가 아니야. 처음부터.', 'これのための場所じゃない。最初から。') },
      { text: L('사당에서 들었던 「놓고 가」가 떠오른다. 우물의 손, 길을 가리키던 아이들. 나를 부르는 목소리와는 달랐다.', '祠で聞いた「置いていけ」が蘇る。井戸の手、道を指した子供たち。私を呼ぶ声とは違っていた。') },
      { who: L('미오', 'ミオ'), text: L('쫓아오던 것들은 가져오라고 하지 않았어. 그런데 넌 계속…….', '追ってきたものたちは持ってこいとは言わなかった。なのに、あなたはずっと……。') },
    );
    await quests.glitchTo(L('마지막 공물을 찾아라', '最後の供物を探せ'), 'gm', 1.0);
    await wait(700);
    await quests.glitchTo(L('마지막 봉인을 없애라', '最後の封を解け'), 'gm', 1.2);
    await wait(700);
    await quests.glitchTo(L('나를 꺼내줘', 'わたしを出して'), 'gm', 1.6);
    await dialogue.say(
      { who: L('미오', 'ミオ'), text: L('돌아갈 길이 아니라, 네가 나올 길이었어?', '帰る道じゃなく、あなたが出てくる道だったの？') },
      { who: '???', text: L('미오.', 'ミオ。') },
      { who: '???', text: L('여기까지 잘 왔구나.', 'よくここまで来たね。') },
    );
    this.state = 'complete';
    this.deps.checkpoint();
    this.deps.onComplete();
  }
}
