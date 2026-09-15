import { L } from '@/core/i18n';
import type { Dialogue, DialogueLine } from './dialogue';
import type { Quests } from './quests';

const line = (ko: string, ja: string): DialogueLine => ({ text: L(ko, ja) });
const mio = (ko: string, ja: string): DialogueLine => ({ who: L('미오', 'ミオ'), text: L(ko, ja) });
const host = (ko: string, ja: string): DialogueLine => ({ who: L('히간누시', '彼岸主'), text: L(ko, ja) });

export const CRYPT_TRACES = [
  { id: 'crypt:root-path', title: L('아래로 이어진 뿌리', '下へ続く根'), prompt: L('벽을 타고 내려온 검은 뿌리를 짚는다', '壁を下りてきた黒い根を辿る'),
    lines: [line('굵은 뿌리 다섯 줄이 천장에서 내려온다. 바깥쪽은 흙으로 덮였지만 안쪽에는 제단의 붉은 돌가루가 묻어 있다.', '五本の太い根が天井から下りている。外側には土、内側には祭壇の赤い石の粉がついている。'),
      mio('내가 공물을 놓을 때마다 자랐던 뿌리야. 위에서 막힌 게 아니라…… 여기까지 이어져 있었어.', '供物を置くたびに伸びた根だ。上で止まったんじゃなく……ここまで続いていた。')] },
  { id: 'crypt:borrowed-orders', title: L('공중에 남은 명령', '宙に残された命令'), prompt: L('벽에서 떨어져 있는 붓글씨를 확인한다', '壁から離れて浮かぶ筆文字を確かめる'),
    lines: [line('등불을 옮겨도 글자는 벽에 붙지 않는다. 검은 획 뒤로 돌 틈이 보인다. 읽을 때마다 보던 목표창과 같은 글씨다.', '灯りを動かしても文字は壁に貼りつかない。黒い画の向こうに石の隙間が見える。いつも目標欄で見ていた文字だ。'),
      mio('마을의 규칙인 줄 알았어. 누군가 여기서 쓰고 있었구나.', '村の決まりだと思っていた。誰かがここで書いていたんだ。')] },
  { id: 'crypt:unfilled-seat', title: L('다섯 흔적과 빈자리', '五つの痕と空いた場所'), prompt: L('문 앞의 공물 자국을 대조한다', '門前の供物の痕を照合する'),
    lines: [line('바닥에 작은 물건을 감쌌던 뿌리 자국 다섯. 그 뒤에는 봉인패의 폭보다 훨씬 넓은 빈자리가 있다.', '床に小物を包んでいた根の痕が五つ。その後ろには、封印札よりずっと広い空きがある。'),
      mio('봉인패를 놓으면 끝나는 의식이 아니야. 이 빈자리는 누구를 기다리고 있는 거지?', '封印札を置けば終わる儀式じゃない。この空きは、誰を待っているの？')] },
] as const;

/** ACT 18 checkpoints are observations and committed scene boundaries, never timer offsets. */
export class Act18Revelation {
  private work: Promise<void> | null = null;
  get busy() { return this.work !== null; }
  get entered() { return this.deps.evidence.has('crypt:entered'); }
  get nextTrace() { return CRYPT_TRACES.findIndex(t => !this.deps.evidence.has(t.id)); }
  get complete() { return this.deps.evidence.has('crypt:revealed'); }
  get moved() { return this.deps.evidence.has('crypt:offerings-moved'); }
  constructor(private deps: {
    evidence: ReadonlySet<string>;
    dialogue: Pick<Dialogue, 'say'>;
    quests: Pick<Quests, 'glitchTo'>;
    canEnter: () => boolean;
    inside: () => boolean;
    travel: (down: boolean) => Promise<void>;
    remember: (id: string) => void;
    checkpoint: () => void;
    wait: (ms: number) => Promise<void>;
    stage: (value: 'hidden' | 'waiting' | 'facing' | 'command') => void;
    prepareOfferings: () => Promise<void>;
    descendOfferings: (progress: number) => void;
    finish: () => void;
  }) {}

  private run(action: () => Promise<void>) {
    if (this.work) return this.work;
    // Defer execution so re-entrant HUD/interaction callbacks already see busy=true.
    this.work = Promise.resolve().then(action).finally(() => { this.work = null; });
    return this.work;
  }
  enter() {
    if (!this.deps.canEnter() || this.deps.inside()) return Promise.resolve();
    return this.run(async () => {
      await this.deps.travel(true);
      if (!this.entered) {
        this.deps.remember('crypt:entered');
        await this.deps.dialogue.say(
          line('사다리 아래에서 길이 서쪽으로 꺾인다. 위에서 들리던 축제 소리는 멎고, 돌 틈을 긁는 소리만 북쪽으로 이어진다.', '梯子の下で道が西へ曲がる。上の祭りの音は止み、石の隙間を掻く音だけが北へ続く。'),
          mio('내려오라고 한 건 네 목소리였지. 이번에는 내가 확인하겠어.', '下りてこいと言ったのは、おまえの声だった。今度は自分で確かめる。'));
      }
    });
  }
  leave() {
    if (!this.deps.inside()) return Promise.resolve();
    return this.run(async () => { await this.deps.travel(false); this.deps.checkpoint(); });
  }
  read(index: number) {
    const trace = CRYPT_TRACES[index];
    if (!trace || !this.deps.inside() || !this.deps.canEnter() || this.complete || this.deps.evidence.has(trace.id)) return Promise.resolve();
    return this.run(async () => { await this.deps.dialogue.say(...trace.lines); this.deps.remember(trace.id); });
  }
  restoreVisuals() {
    this.deps.stage(this.complete ? 'command' : this.deps.evidence.has('crypt:encounter-started') ? 'waiting' : 'hidden');
    this.deps.descendOfferings(this.moved ? 1 : 0);
  }
  async resume() {
    this.restoreVisuals();
    if (this.moved) { await this.deps.prepareOfferings(); this.deps.descendOfferings(1); }
    if (this.complete) { this.deps.finish(); return; }
    if (this.deps.inside() && this.deps.evidence.has('crypt:encounter-started')) await this.encounter();
  }
  encounter() {
    if (this.complete || this.nextTrace >= 0 || !this.deps.inside() || !this.deps.canEnter()) return Promise.resolve();
    return this.run(async () => {
      const d = this.deps;
      d.remember('crypt:encounter-started'); d.stage('waiting');
      await d.dialogue.say(line('검은 문 앞에 흰 기모노를 입은 여자가 서 있다. 문을 보는 줄 알았는데, 벽의 글자가 그 손을 따라 움직인다.', '黒い門の前に白い着物の女が立っている。門を見ていると思ったが、壁の文字がその手を追って動く。'));
      d.stage('facing'); await d.wait(1100);
      await d.dialogue.say(line('여자가 돌아본다. 얼굴이 있어야 할 자리에서 붉은 피안화가 피어 있다.', '女が振り返る。顔のあるはずの場所に、赤い彼岸花が咲いている。'),
        host('하나만 더. 그러면 언니를 돌려줄게.', 'あと一つ。そうしたら、お姉ちゃんを返してあげる。'),
        mio('네가…… 날 불렀어?', 'おまえが……私を呼んだの？'), host('10년 전에도. 오늘도.', '十年前も。今日も。'));
      d.stage('command');
      await d.quests.glitchTo(L('【마지막 공물을 바쳐라】', '【最後の供物を捧げよ】'), 'gm', 1.4);
      await d.prepareOfferings(); await d.wait(0);
      if (!this.moved) {
        await d.dialogue.say(line('손가락이 움직이자 천장의 뿌리가 끌려 내려온다. 돌에 붙어 떼지 못했던 다섯 공물이 매달려 있다.', '指が動くと天井の根が引き下ろされる。石に貼りついて外せなかった五つの供物が吊られている。'));
        for (let i = 0; i <= 45; i++) { d.descendOfferings(i / 45); await d.wait(40); }
        d.remember('crypt:offerings-moved');
      }
      await d.dialogue.say(mio('돌려주는 게 아니야. 여기서 끝내려고 가져온 거야.', '返してくれるんじゃない。ここで終わらせるために持ってきたんだ。'),
        host('네 손에 있는 것만 남았어.', 'あとは、その手にあるものだけ。'),
        line('미오는 봉인패를 품으로 당긴다. 어둠 속에서 다른 목소리가 들린다.', 'ミオは封印札を胸に引き寄せる。闇から別の声が聞こえる。'),
        { who: '???', text: L('하지 마.', 'やめて。') },
        mio('……언니?', '……お姉ちゃん？'));
      d.remember('crypt:revealed'); d.finish();
    });
  }
}
