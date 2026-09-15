import { L } from '@/core/i18n';
import type { Dialogue, DialogueLine } from './dialogue';

const line = (ko: string, ja: string): DialogueLine => ({ text: L(ko, ja) });
const mio = (ko: string, ja: string): DialogueLine => ({ who: L('미오', 'ミオ'), text: L(ko, ja) });
export const DISPATCH_SETTING = 'manor:dispatch-setting-';
export const DISPATCH_DIALS = [
  { title: L('행선', '行先'), labels: [L('신사', '社'), L('학교·우물', '学校・井戸'), L('회관', '集会所'), L('산길', '山道')], answer: 1 },
  { title: L('업무', '用務'), labels: [L('아이 수색', '子供捜索'), L('출입 봉쇄', '出入封鎖'), L('생존 확인', '生存確認'), L('제물 호송', '贄の護送')], answer: 2 },
  { title: L('회신', '返信'), labels: [L('명령 완료', '命令完了'), L('응답 없음', '応答なし'), L('모두 사망', '全員死亡'), L('확인 대기', '確認待ち')], answer: 3 },
] as const;
export const DISPATCH_CLUES = [
  {
    id: 'manor:dispatch-clue-0', title: L('겹쳐 찍힌 행선', '重ね押しされた行先'),
    prompt: L('서재 문옆 압흔판을 탁본한다', '書斎の戸脇の圧痕を拓本に取る'),
    lines: [
      line('얇은 종이를 대고 문지르자 「신사」 아래에서 더 오래된 글씨가 올라온다. 「학교·우물」. 같은 문서가 다른 곳으로 사람들을 보냈다.', '薄紙を当てて擦ると「社」の下から古い字が浮かぶ。「学校・井戸」。同じ文書が人を別の場所へ送っていた。'),
      line('종이 옆에 결재함 사용표. 「세 인장판을 최초 배부본에 맞추고 누를 것. 덧쓴 명령으로 원본을 덮지 말 것.」', '紙の横に決裁箱の使い方。「三枚の印字板を初回配布の控えに合わせて押すこと。書き直した命令で原本を覆わないこと。」'),
      mio('이름을 적기 전에, 먼저 보냈던 곳이 있었어. 학교와 우물. 그곳에서 돌아올 답을 기다렸겠지.', '名前を書く前に、先に人を送った場所があった。学校と井戸。そこからの返事を待っていたはず。'),
      line('탁본 가장자리의 홈이 결재함 첫 인장판의 홈과 같다. 원본의 행선을 맞추는 표식이다.', '拓本の端の溝は決裁箱の一枚目と同じ。原本の行先を合わせる印だ。'),
    ],
    summary: L('최초 배부본의 행선은 학교·우물이다. 결재함은 수정 명령이 아니라 원본의 세 항목을 맞춰 연다.', '初回配布の行先は学校・井戸。決裁箱は修正命令でなく、原本の三項目を合わせて開く。'),
  },
  {
    id: 'manor:dispatch-clue-1', title: L('풀지 못한 전달 꾸러미', '解かれなかった伝達の包み'),
    prompt: L('안방 전달 꾸러미의 매듭을 푼다', '寝室の伝達の包みの結びを解く'),
    lines: [
      line('이불 곁에 배부되지 않은 종이 꾸러미가 있다. 매듭을 풀자 서로 다른 손으로 쓴 부탁들이 펼쳐진다.', '布団の傍に、配られなかった紙の包み。結びを解くと、違う筆跡の頼みごとが開く。'),
      line('「학교에 남은 아이가 있는지 확인해 주세요.」「우물 아래에서 아직 두드리는 소리가 납니다.」 이름 대신 돌아올 답을 받을 집들이 적혔다.', '「学校に残った子がいないか確かめてください。」「井戸の下からまだ叩く音がします。」名前の代わりに、返事を受け取る家が記されている。'),
      line('첫 배부표의 업무란은 「생존 확인」. 뒤늦게 끼워 넣은 아이 수색 전갈과 종이의 접힌 방향부터 다르다.', '最初の配布札の用務は「生存確認」。後から挟まれた子供捜索の伝言とは、紙の折り目から違う。'),
      mio('부탁을 받은 사람들도 있었어. 전부 같은 생각으로 횃불을 든 건 아니었겠지. 그런데 누구의 부탁이 먼저 지워졌을까.', '頼まれた人たちもいた。皆が同じ思いで松明を持ったわけじゃないはず。でも、誰の頼みが先に消されたんだろう。'),
    ],
    summary: L('첫 배부표의 업무는 생존 확인이다. 학교와 우물에 남은 사람을 확인해 달라는 부탁들이 새 수색 전갈 밑에 묶여 있었다.', '初回配布の用務は生存確認。学校と井戸に残った人を確かめてほしいという頼みが、新たな捜索の伝言の下に結ばれていた。'),
  },
  {
    id: 'manor:dispatch-clue-2', title: L('아직 비어 있는 회신함', 'まだ空の返信箱'),
    prompt: L('지하 회신함의 빈 칸과 접수표를 대조한다', '地下の返信箱の空きと受付札を照合する'),
    lines: [
      line('학교, 우물. 회신함의 두 칸이 비어 있다. 칸 아래의 최초 접수표에는 둘 다 「확인 대기」라고 적혔다.', '学校、井戸。返信箱の二つの枠は空。下の最初の受付札は、どちらも「確認待ち」。'),
      line('옆의 분류 안내. 「응답 없음은 재확인 후 기록. 빈 칸을 사망 확인으로 옮기지 말 것.」 하지만 재확인표까지 비어 있다.', '横の分類案内。「応答なしは再確認の後に記録。空欄を死亡確認に移さないこと。」だが再確認の札まで空だ。'),
      mio('답을 못 받았다는 것과, 아무도 없었다는 건 달라. 이 기록은 아직 확인을 기다리고 있었어.', '返事を受け取れなかったことと、誰もいなかったことは違う。この記録はまだ確認を待っていた。'),
      line('결재함 손잡이에 작은 쇠열쇠 그림이 새겨져 있다. 불단 덮개의 자물쇠와 같은 갈라진 이빨 모양이다.', '決裁箱の取っ手に小さな鍵の印。仏壇の覆いの錠と同じ、割れた歯の形をしている。'),
    ],
    summary: L('원본의 회신 상태는 확인 대기다. 학교·우물의 회신과 재확인표가 모두 비어 있어 응답 없음이나 사망으로 확정할 수 없다.', '原本の返信状態は確認待ち。学校・井戸の返信も再確認札も空で、応答なしや死亡とは確定できない。'),
  },
] as const;

/** 세 판의 조합은 키 하나로 교체 저장한다. 회전 횟수만큼 증거/텔레메트리를 늘리지 않는다. */
export function readDispatchSetting(found: ReadonlySet<string>): number[] {
  let code = 0;
  for (const id of found) {
    if (!id.startsWith(DISPATCH_SETTING)) continue;
    const value = id.slice(DISPATCH_SETTING.length);
    if (/^(0|[1-9]\d?)$/.test(value) && Number(value) < 64) code = Number(value);
  }
  return [code % 4, Math.floor(code / 4) % 4, Math.floor(code / 16) % 4];
}
export function dispatchIsAligned(values: readonly number[]) {
  return values.length === 3 && DISPATCH_DIALS.every((d, i) => values[i] === d.answer);
}
export function dispatchRequired(fudaOpen: boolean, found: ReadonlySet<string>) {
  return fudaOpen && !found.has('manor:dispatch-unlocked') && !found.has('manor:dispatch-legacy');
}

export class ManorDispatch {
  private playing = false;
  private values: number[];
  get busy() { return this.playing; }
  get setting(): readonly number[] { return this.values; }
  get nextClue() { return DISPATCH_CLUES.findIndex(c => !this.d.evidence.has(c.id)); }
  get clueCount() { return DISPATCH_CLUES.filter(c => this.d.evidence.has(c.id)).length; }
  get printed() { return this.d.evidence.has('manor:dispatch-proof'); }
  get hasKey() { return this.d.evidence.has('manor:dispatch-key'); }
  get complete() { return this.d.evidence.has('manor:dispatch-unlocked'); }
  constructor(private d: {
    evidence: ReadonlySet<string>; dialogue: Pick<Dialogue, 'say'>;
    remember: (id: string) => unknown; saveSetting: (code: number) => void;
    canUse: () => boolean; proof: (values: readonly number[], matches: boolean) => void;
    begin?: () => void;
  }) { this.values = readDispatchSetting(d.evidence); }
  restoreSetting() { if (!this.busy) this.values = readDispatchSetting(this.d.evidence); }
  private async run(action: () => Promise<void>) {
    if (this.busy || !this.d.canUse() || this.complete) return false;
    this.playing = true;
    try { this.d.begin?.(); await action(); return true; } finally { this.playing = false; }
  }
  read(index: number) {
    const clue = DISPATCH_CLUES[index];
    if (!clue || this.d.evidence.has(clue.id)) return Promise.resolve(false);
    return this.run(async () => { await this.d.dialogue.say(...clue.lines); this.d.remember(clue.id); });
  }
  rotate(index: number) {
    if (this.busy || !this.d.canUse() || this.printed || this.complete || !Number.isInteger(index) || index < 0 || index > 2) return false;
    this.d.begin?.();
    this.values[index] = (this.values[index]! + 1) % 4;
    this.d.saveSetting(this.values[0]! + this.values[1]! * 4 + this.values[2]! * 16);
    return true;
  }
  press() {
    if (this.printed) return Promise.resolve(false);
    return this.run(async () => {
      if (this.nextClue >= 0) {
        await this.d.dialogue.say(mio('맞춰 찍기 전에 원본을 찾아야 해. 서재의 압흔, 안방의 전달 꾸러미, 지하 회신함을 대조하자.', '合わせて押す前に原本を探そう。書斎の圧痕、寝室の包み、地下の返信箱を照合しよう。'));
        return;
      }
      const matches = dispatchIsAligned(this.values);
      this.d.proof(this.values, matches);
      if (!matches) {
        await this.d.dialogue.say(
          line('인장판이 내려가지만 서랍은 닫힌 채다. 찍힌 글의 가장자리에서 홈이 어긋난다.', '印字板は下がるが、引き出しは閉じたまま。押された字の端で溝がずれる。'),
          mio('현재의 수색 명령이 아니라 최초 배부본이야. 빈 회신칸도 완료나 죽음으로 바꾸면 안 돼.', '今の捜索命令じゃなく、最初の控え。空の返信欄も、完了や死に変えてはいけない。'),
        ); return;
      }
      await this.d.dialogue.say(
        line('학교·우물 — 생존 확인 — 확인 대기. 세 판의 홈이 한 줄로 맞물리고 서랍 안의 걸쇠가 풀린다.', '学校・井戸 — 生存確認 — 確認待ち。三枚の溝が一列に噛み合い、引き出しの留め金が外れる。'),
        line('복원한 종이 밑에 불단의 작은 열쇠가 있다. 마지막 명령을 찍은 붉은 인주도 아직 함 안에 남았다.', '復元した紙の下に仏壇の小さな鍵。最後の命令を押した赤い朱肉も、まだ箱に残っている。'),
        mio('인장이 가짜였던 게 아니야. 같은 함으로 다른 명령을 찍었어. 누가 바꿨는지는 기록의 순서까지 봐야 해.', '印が偽物だったんじゃない。同じ箱で違う命令を押した。誰が変えたのかは、記録の順まで見ないと。'),
      );
      this.d.remember('manor:dispatch-proof');
    });
  }
  takeKey() {
    if (!this.printed || this.hasKey) return Promise.resolve(false);
    return this.run(async () => {
      await this.d.dialogue.say(line('열쇠에 「불단 보관」이라는 표가 달렸다. 미오는 원본을 덮지 않고 열쇠만 집는다.', '鍵に「仏壇保管」の札。ミオは原本を覆わず、鍵だけを取る。'),
        mio('위로 돌아가자. 내 이름을 적은 패를 직접 확인하겠어.', '上へ戻ろう。私の名を書いた札を、自分で確かめる。'));
      this.d.remember('manor:dispatch-key');
    });
  }
  unlock() {
    if (!this.hasKey) return Promise.resolve(false);
    return this.run(async () => {
      await this.d.dialogue.say(line('갈라진 열쇠 끝이 자물쇠에 들어간다. 덮개가 열리고, 봉인패의 붉은 글자가 드러난다.', '割れた鍵の歯が錠に入る。覆いが開き、封印札の赤い字が現れる。'),
        mio('사람을 확인하던 말이, 아이를 데려오라는 명령이 됐어. 이 패를 들면 그 사이의 기억도 보일까.', '人を確かめる言葉が、子供を連れてこいという命令になった。この札を持てば、その間の記憶も見えるかな。'));
      this.d.remember('manor:dispatch-unlocked');
    });
  }
}
