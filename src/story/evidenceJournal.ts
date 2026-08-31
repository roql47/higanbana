import { L } from '@/core/i18n';

interface EvidenceEntry {
  id: string;
  area: 'village' | 'shrine' | 'school' | 'well' | 'inn' | 'manor';
  title: string;
  detail: string;
}

const AREA_NAME: Record<EvidenceEntry['area'], string> = {
  village: L('멈춘 마을', '止まった村'),
  shrine: L('오래된 사당', '古い祠'),
  school: L('폐교', '廃校'),
  well: L('공동우물', '共同井戸'),
  inn: L('폐여관', '廃旅館'),
  manor: L('촌장의 저택', '村長屋敷'),
};

const E = (id: string, area: EvidenceEntry['area'], koTitle: string, jaTitle: string, koDetail: string, jaDetail: string): EvidenceEntry => ({
  id, area, title: L(koTitle, jaTitle), detail: L(koDetail, jaDetail),
});

/** 플레이어가 실제로 읽은 뒤에만 나타나는 조사 기록. 미발견 정보는 제목조차 노출하지 않는다. */
const ENTRIES: EvidenceEntry[] = [
  E('village:tea', 'village', '재가 된 차', '灰になった茶', '방금 전까지 김이 났지만 다시 오자 표면에 검은 재만 남았다.', 'さっきまで湯気が立っていたのに、戻ると表面に黒い灰だけが残っていた。'),
  E('village:tv', 'village', '18시 12분의 TV', '十八時十二分のテレビ', '꺼진 집의 화면이 같은 시각에 멈춰 있다. 화면 속 형체가 내 움직임을 늦게 따라온다.', '無人の家の画面が同じ時刻で止まっている。画面の影が私の動きを遅れて追う。'),
  E('village:geta', 'village', '젖은 아이 게다', '濡れた子供の下駄', '게다는 현관에서 골목 쪽으로 옮겨졌고, 젖은 발자국이 뒤따른다.', '下駄は玄関から路地へ移り、濡れた足跡が続いている。'),
  E('village:furin', 'village', '바람 없는 풍경', '風のない風鈴', '쪽지에는 이름을 불러도 대답하지 말라는 경고가 적혀 있다.', '短冊には、名を呼ばれても返事をするなと書かれている。'),
  E('village:watcher', 'village', '골목 끝의 아이', '路地の先の子供', '보고 있을 때만 서 있다. 시선을 돌리고 다시 보면 다른 골목에 나타난다.', '見ている間だけ立っている。目を逸らすと、別の路地に現れる。'),
  E('inference:village-simultaneous', 'village', '가설: 동시에 멈췄다', '仮説：同時に止まった', '생활 흔적은 자연스럽게 버려진 게 아니다. 모두 18시 12분 한순간에 끊겼다.', '生活の痕跡は自然に捨てられたのではない。すべて十八時十二分に途切れた。'),
  E('inference:village-mimic', 'village', '가설: 목소리를 흉내 낸다', '仮説：声を真似る', '방송과 경고는 같은 존재가 만든 것이 아닐 수 있다. 대답을 유도하는 목소리를 믿으면 안 된다.', '放送と警告は同じ存在のものとは限らない。返事を誘う声を信じてはいけない。'),
  E('inference:village-sealed', 'village', '가설: 마을 자체가 봉인이다', '仮説：村そのものが封印', '사람들이 떠난 것이 아니라 그 순간과 함께 마을 안에 붙들렸을 가능성이 있다.', '人々が去ったのではなく、あの瞬間ごと村に縛られた可能性がある。'),
  E('inference:village-complete', 'village', '정리: 누군가 배치한 흔적', '整理：誰かが並べた痕跡', '다섯 흔적은 우연이 아니다. 누군가 내가 보고, 듣고, 신사로 가도록 순서대로 배치했다.', '五つの痕跡は偶然ではない。誰かが私を見聞きさせ、社へ導くよう並べた。'),

  E('suzu:ema-left', 'shrine', '왼쪽 매듭', '左の結び', '비를 맞은 에마의 붉은 실이 방울 봉인으로 이어진다.', '雨に濡れた絵馬の赤い糸が、鈴の封へ続いている。'),
  E('suzu:ema-right', 'shrine', '오른쪽 매듭', '右の結び', '반대쪽 에마에도 같은 아이의 손자국이 남았다.', '反対側の絵馬にも同じ子供の手形が残っている。'),
  E('suzu:altar-back', 'shrine', '제단 측면 매듭', '祭壇側面の結び', '금줄은 방울 아래의 것을 눌러 둔다. 겹친 매듭은 마지막에 푼 것부터 되묶어야 원래 형태로 돌아간다.', '注連縄は鈴の下のものを押さえている。重なった結びは、最後に解いたものから戻さなければ元の形にならない。'),
  E('consequence:suzu-disturbed', 'shrine', '훼손된 금줄', '乱された注連縄', '억지로 건드린 매듭이 느슨해졌다. 사당 안의 움직임이 더 빨라질 것이다.', '無理に触れた結びが緩んだ。祠の中の動きは速くなるだろう。'),

  E('school:journal', 'school', '보건일지', '保健日誌', '나츠메 유리는 반복해서 “엄마 목소리”를 들었다고 기록돼 있다.', '夏目ユリは繰り返し「母の声」を聞いたと記録されている。'),
  E('school:attendance', 'school', '출석부의 빈칸', '出席簿の空欄', '참사 당일 유리의 출석만 두 번 지워졌다.', '惨事の日、ユリの出席だけが二度消されている。'),
  E('school:desk-name', 'school', '책상 밑 이름', '机の下の名前', '책상 밑에 ‘나츠메 유리’가 손톱으로 새겨져 있다.', '机の裏に「夏目ユリ」と爪で刻まれている。'),
  E('school:crayon', 'school', '벽장 속 크레용', '戸棚のクレヨン', '언니는 엄마 목소리도 가짜라고 했다. 아이는 대답하지 않고 숨었다.', '姉は母の声も偽物だと言った。子供は返事をせず隠れた。'),
  E('school:response-silent', 'school', '대답하지 않은 출석', '答えなかった出席', '끊어진 출석 방송이 내 대답을 기다렸다. 침묵하자 복도 끝의 형광등이 하나씩 꺼졌다.', '途切れた出席放送は私の返事を待っていた。黙っていると、廊下の蛍光灯が端から消えた。'),
  E('school:response-answered', 'school', '잘못한 대답', '誤った返事', '유리 대신 “네”라고 답하자 얼굴 없는 학생이 즉시 모습을 드러냈다. 목소리는 이름과 사람을 구별하지 않는다.', 'ユリの代わりに「はい」と答えると、顔のない生徒がすぐ姿を現した。声は名前と人を区別しない。'),
  E('school:called', 'school', '불러 준 이름', '呼び返した名前', '방송실에서 이름을 온전히 불렀다. 복도의 학생이 처음으로 고개를 들었다.', '放送室で名を正しく呼んだ。廊下の生徒が初めて顔を上げた。'),
  E('school:crayon-recalled', 'school', '푸른 원피스', '青いワンピース', '벽장 속 아이의 옷은 가족사진 속 어린 나와 같았다.', '戸棚の子供の服は、家族写真の幼い私と同じだった。'),

  E('well:surface-tray', 'well', '비어 있는 장례 쟁반', '空の葬送盆', '동전 세 닢과 작은 장난감이 놓였던 물자국만 남았다.', '三枚の銭と小さな玩具が置かれていた水跡だけが残る。'),
  E('well:surface-rope', 'well', '밖에서 잘린 밧줄', '外から切られた縄', '칼자국은 우물 바깥쪽에 있다. 아래의 누군가가 끊은 것이 아니다.', '刃痕は井戸の外側にある。下にいた者が切ったのではない。'),
  E('well:surface-footprints', 'well', '돌아오지 않은 발자국', '戻らない足跡', '성인 여성의 젖은 발자국은 금줄 안으로 들어가지만 밖으로 나오지 않는다.', '成人女性の濡れた足跡は注連縄の内へ入り、外へ戻っていない。'),
  E('well:niche-0', 'well', '하루의 환자복', 'ハルの病衣', '사망 확인일은 피안제 사흘 전이다. 하루는 우물에 오기 전부터 죽어 있었다.', '死亡確認日は彼岸祭の三日前。ハルは井戸へ来る前から亡くなっていた。'),
  E('well:niche-1', 'well', '어머니가 남긴 경고', '母が残した警告', '소매의 손톱 폭과 벽의 글씨가 같다. “내 아이가 아니다”는 여자가 자기 자신에게 쓴 경고다.', '袖の爪幅と壁の字が同じ。「うちの子じゃない」は女が自分へ残した警告だ。'),
  E('well:niche-2', 'well', '하루의 목마', 'ハルの木馬', '동전은 세 경계를 건너는 장례 풍습이었다. 중앙의 목소리는 목마보다 동전이 움직이기만 기다린다.', '銭は三つの境を渡る葬送の習わしだった。中央の声は木馬より銭が動くのを待っている。'),
  E('well:answer-death', 'well', '말해 버린 죽음', '告げた死', '하루가 이미 죽었다고 말하자 여자는 부정하며 물 위로 솟았다.', 'ハルは既に死んだと告げると、女は否定して水上へ立ち上がった。'),
  E('well:answer-voice', 'well', '목소리를 따른 대답', '声に従う返事', '아래에서 하루의 목소리를 들었다고 하자 여자는 나를 아이에게 갈 안내자로 오해했다.', '下でハルの声を聞いたと答えると、女は私を子へ導く案内人と誤解した。'),
  E('well:answer-silence', 'well', '우물에서의 침묵', '井戸での沈黙', '대답하지 않았다. 여자는 수면 아래에서 나를 놓치지 않고 따라왔다.', '答えなかった。女は水面下から私を見失わず追ってきた。'),
  E('well:answer-truth', 'well', '경고의 주인', '警告の主', '벽의 경고는 어머니가 자기 자신에게 남긴 것이다. 목소리는 하루가 아니다.', '壁の警告は母が自分へ残したもの。声はハルではない。'),
  E('well:escape-voice', 'well', '가짜 아이에게 맡긴 탈출', '偽の子に任せた脱出', '가짜 목소리가 여자를 데려가게 두고 빠져나왔다. 그 목소리는 동전을 신사로 옮기게 하려 했다.', '偽の声に女を連れて行かせて脱出した。その声は銭を社へ運ばせようとしていた。'),
  E('well:escape-stone', 'well', '내가 만든 물소리', '自分で作った水音', '아이 목소리를 이용하지 않고 조약돌의 착수음으로 여자의 손을 반대편으로 돌렸다.', '子供の声を利用せず、小石の着水音で女の手を反対へ向けた。'),
  E('well:escape-truth', 'well', '목마와 진실', '木馬と真実', '목마를 내려놓고 그 목소리가 하루가 아니라고 외쳤다. 여자의 손이 처음으로 멈췄다.', '木馬を置き、その声はハルではないと叫んだ。女の手が初めて止まった。'),
  E('well:child-call', 'well', '아이의 대답', '子供の返事', '숨은 아이의 목소리를 들으면 여자는 공격을 멈추고 그쪽을 본다.', '隠れた子供の声を聞くと、女は襲うのを止め、そちらを見る。'),

  E('inn:register', 'inn', '열네 명의 숙박부', '十四人の宿帳', '방은 열셋인데 숙박자는 열넷이다. 한 명은 거울 쪽에 배정됐다.', '部屋は十三、宿泊者は十四。一人は鏡の側に割り当てられた。'),
  E('inn:stairs', 'inn', '안쪽에서 박힌 못', '内側から打たれた釘', '계단은 침입을 막은 것이 아니라 위층의 무언가가 내려오지 못하게 막았다.', '階段は侵入でなく、上階の何かが降りるのを防いでいた。'),
  E('inn:mirror', 'inn', '거울 속 피안제', '鏡の中の彼岸祭', '거울 속에서 어린 사요가 내 손바닥에 원을 두 번 그렸다.', '鏡の中で幼いサヨが私の掌に円を二度描いた。'),
  E('inn:wakyo', 'inn', '탄 자국 없는 와쿄', '焦げ跡のない和鏡', '와쿄 속 방에는 화재 흔적이 없다. 현실과 다른 시각의 공간을 비춘다.', '和鏡の部屋には火事の跡がない。現実と異なる時刻の空間を映す。'),
  E('inn:wall-mirror', 'inn', '마주 보는 두 거울', '向かい合う二つの鏡', '와쿄와 벽거울을 마주 대자 틈이 통로처럼 열렸다.', '和鏡と壁鏡を向け合うと、隙間が通路のように開いた。'),
  E('inn:passage', 'inn', '거울 통로', '鏡の通路', '거울 너머의 여관은 불타기 전 순간에 멈춰 있다.', '鏡の向こうの旅館は、燃える前の瞬間で止まっている。'),

  E('manor:seal', 'manor', '봉인의 구조', '封印の構造', '공물은 신에게 바치는 물건이 아니라 피안으로 이어지는 길을 하나씩 닫는다.', '供物は神への捧げ物でなく、彼岸へ続く道を一つずつ閉じる。'),
  E('manor:substitute', 'manor', '대체 의식', '代替儀式', '본래 의식을 잃었을 때 “문을 연 자의 피”를 바치는 잔혹한 대체법이 있다.', '本来の儀式を失った時、「門を開いた者の血」を捧げる残酷な代替法がある。'),
  E('manor:search', 'manor', '주민 수색 명령', '住民捜索命令', '주민들은 미오를 발견하면 신사로 데려가라는 명령을 받았다.', '住民はミオを見つけ次第、社へ連れて来るよう命じられた。'),
  E('act11:bell-recovery-attempt', 'shrine', '되찾을 수 없는 공물', '取り戻せない供物', '검은 뿌리가 봉납한 방울을 받침대와 한 덩어리로 만들었다. 목표창도 회수를 거부했다.', '黒い根が供えた鈴を台座と一体にした。目標欄も回収を拒んだ。'),
];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class EvidenceJournal {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  isOpen = false;
  canOpen?: () => boolean;
  onToggle?: (open: boolean) => void;
  private latest: string | null = null;
  private pulseTimer = 0;

  constructor(private getEvidence: () => ReadonlySet<string>) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'journal-button hidden';
    this.button.innerHTML = `<kbd>J</kbd><span>${L('조사 기록', '調査記録')}</span><i>0</i>`;
    (document.getElementById('hud') ?? document.body).appendChild(this.button);

    this.el = document.createElement('div');
    this.el.className = 'journal hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.innerHTML = `
      <section class="journal-book">
        <header class="journal-head">
          <div><small>${L('아마미야 미오 · 개인 기록', '雨宮ミオ · 個人記録')}</small><h2>${L('히가사토 조사 기록', '彼ヶ里 調査記録')}</h2></div>
          <div class="journal-count"></div>
          <button class="journal-close" type="button" aria-label="${L('닫기', '閉じる')}">×</button>
        </header>
        <div class="journal-pages"><div class="journal-evidence"></div><aside class="journal-theories"></aside></div>
        <footer><span>${L('확인한 사실만 기록한다.', '確かめた事実だけを記す。')}</span><span><kbd>J</kbd> / <kbd>Esc</kbd> ${L('닫기', '閉じる')}</span></footer>
      </section>`;
    document.body.appendChild(this.el);
    this.button.addEventListener('click', () => this.toggle());
    this.el.querySelector('.journal-close')!.addEventListener('click', () => this.toggle(false));
    this.el.addEventListener('pointerdown', (ev) => { if (ev.target === this.el) this.toggle(false); });
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'KeyJ') {
        if (!this.isOpen && this.canOpen && !this.canOpen()) return;
        ev.preventDefault(); ev.stopImmediatePropagation(); this.toggle();
      } else if (ev.code === 'Escape' && this.isOpen) {
        ev.preventDefault(); ev.stopImmediatePropagation(); this.toggle(false);
      }
    });
    this.sync();
  }

  record(id: string) {
    this.latest = id;
    this.sync();
    this.button.classList.remove('updated');
    void this.button.offsetWidth;
    this.button.classList.add('updated');
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = window.setTimeout(() => this.button.classList.remove('updated'), 2800);
  }

  sync() {
    const found = this.getEvidence();
    this.button.classList.toggle('hidden', found.size === 0);
    this.button.querySelector('i')!.textContent = String(found.size);
    if (!this.isOpen) return;
    this.render();
  }

  toggle(force?: boolean) {
    const next = force ?? !this.isOpen;
    if (next === this.isOpen) return;
    this.isOpen = next;
    if (next) { this.render(); if (document.pointerLockElement) document.exitPointerLock(); }
    this.el.classList.toggle('hidden', !next);
    this.el.classList.toggle('show', next);
    this.onToggle?.(next);
  }

  private render() {
    const found = this.getEvidence();
    const entries = ENTRIES.filter((e) => found.has(e.id));
    const known = new Set(ENTRIES.map((e) => e.id));
    const unknown = [...found].filter((id) => !known.has(id));
    const evidenceEl = this.el.querySelector('.journal-evidence')!;
    const countEl = this.el.querySelector('.journal-count')!;
    countEl.textContent = L(`${entries.length + unknown.length}개의 기록`, `${entries.length + unknown.length}件の記録`);
    const areas = (Object.keys(AREA_NAME) as EvidenceEntry['area'][]).filter((area) => entries.some((e) => e.area === area));
    evidenceEl.innerHTML = areas.map((area) => {
      const cards = entries.filter((e) => e.area === area).map((e) => `
        <article class="journal-entry${e.id === this.latest ? ' latest' : ''}">
          <h4>${esc(e.title)}</h4><p>${esc(e.detail)}</p>
        </article>`).join('');
      return `<section class="journal-area"><h3>${esc(AREA_NAME[area])}</h3>${cards}</section>`;
    }).join('') + (unknown.length ? `<section class="journal-area"><h3>${L('기타', 'その他')}</h3>${unknown.map((id) => `<article class="journal-entry"><h4>${esc(id)}</h4></article>`).join('')}</section>` : '');

    const theories: string[] = [];
    const v = [...found].filter((id) => id.startsWith('village:')).length;
    if (v >= 2 && !found.has('inference:village-complete')) theories.push(L('사람이 차례로 떠난 것이 아니다. 여러 장소의 시간이 한꺼번에 멎었다.', '人が順に去ったのではない。複数の場所の時間が同時に止まった。'));
    if (found.has('inference:village-mimic')) theories.push(L('이 마을의 목소리는 진짜 화자의 의도와 다를 수 있다. 대답하기 전에 물증과 대조할 것.', 'この村の声は本当の話者の意図と違う可能性がある。返事の前に物証と照合する。'));
    if (found.has('inference:village-sealed')) theories.push(L('마을은 폐허가 아니라 봉인된 사건 현장에 가깝다.', '村は廃墟というより、封じられた事件現場に近い。'));
    if (found.has('inference:village-complete')) theories.push(L('흔적과 목표는 나를 신사로 유도하도록 설계됐다. 목표창도 증거로 취급해야 한다.', '痕跡と目標は私を社へ導くよう設計されている。目標欄そのものも証拠として扱う。'));
    if ([...found].filter((id) => id.startsWith('suzu:')).length >= 2) theories.push(L('붉은 끈은 방울의 도난 방지가 아니라 아래의 존재를 묶는 봉인이다.', '赤い糸は鈴の盗難防止でなく、下の存在を縛る封印だ。'));
    if (found.has('school:called')) theories.push(L('가짜 목소리를 끊는 방법은 침묵만이 아니다. 빼앗긴 진짜 이름을 돌려주는 것도 가능하다.', '偽の声を断つ方法は沈黙だけではない。奪われた本当の名を返すこともできる。'));
    if (found.has('well:child-call')) theories.push(L('우물의 여자는 아이를 해친 원혼이 아니라, 아직 아이를 찾는 어머니일 가능성이 높다.', '井戸の女は子供を害した怨霊ではなく、今も子供を捜す母親である可能性が高い。'));
    if (found.has('manor:seal')) theories.push(L('공물을 신사로 옮길수록 봉인은 약해진다. 지금까지의 “퀘스트”는 거짓말이었다.', '供物を社へ運ぶほど封印は弱まる。これまでの「クエスト」は嘘だった。'));
    const theoryEl = this.el.querySelector('.journal-theories')!;
    theoryEl.innerHTML = `<h3>${L('현재 가설', '現在の仮説')}</h3>` + (theories.length
      ? theories.map((t, i) => `<article><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(t)}</p></article>`).join('')
      : `<p class="journal-empty">${L('단서가 더 필요하다.', '手掛かりが足りない。')}</p>`);
    this.latest = null;
  }
}
