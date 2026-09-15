import { L } from '@/core/i18n';
import { modalInput } from '@/ui/modalInput';
import { AREA_NAME, visibleEvidence, type EvidenceEntry } from './evidenceEntries';


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
  private selectedArea: EvidenceEntry['area'] | 'all' = 'all';

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
    this.el.setAttribute('aria-labelledby', 'journal-heading');
    this.el.innerHTML = `
      <section class="journal-book">
        <header class="journal-head">
          <div><small>${L('아마미야 미오 · 개인 기록', '雨宮ミオ · 個人記録')}</small><h2 id="journal-heading">${L('히가사토 조사 기록', '彼ヶ里 調査記録')}</h2></div>
          <div class="journal-count"></div>
          <button class="journal-close" type="button" aria-label="${L('닫기', '閉じる')}">×</button>
        </header>
        <nav class="journal-filters" aria-label="${L('발견한 장소별 기록', '発見した場所の記録')}"></nav>
        <div class="journal-pages"><div class="journal-evidence"></div><aside class="journal-theories"></aside></div>
        <footer><span>${L('확인한 사실만 기록한다.', '確かめた事実だけを記す。')}</span><span><kbd>J</kbd> / <kbd>Esc</kbd> ${L('닫기', '閉じる')}</span></footer>
      </section>`;
    document.body.appendChild(this.el);
    this.button.addEventListener('click', () => this.toggle());
    this.el.querySelector('.journal-close')!.addEventListener('click', () => this.toggle(false));
    this.el.querySelector('.journal-filters')!.addEventListener('click', ev => {
      const button = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-area]');
      if (!button) return;
      this.selectedArea = button.dataset['area'] as EvidenceEntry['area'] | 'all';
      this.render();
      this.el.querySelector<HTMLButtonElement>(`[data-area="${this.selectedArea}"]`)?.focus();
      this.el.querySelector('.journal-evidence')!.scrollTop = 0;
    });
    this.el.addEventListener('pointerdown', (ev) => { if (ev.target === this.el) this.toggle(false); });
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat || !modalInput.allows(this.el)) return;
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
    const count = visibleEvidence(found).length;
    this.button.classList.toggle('hidden', count === 0);
    this.button.querySelector('i')!.textContent = String(count);
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
    if (next) modalInput.open(this.el, () => this.toggle(false));
    else { modalInput.close(this.el); this.latest = null; }
    this.onToggle?.(next);
  }

  private render() {
    const found = this.getEvidence();
    const entries = visibleEvidence(found);
    const evidenceEl = this.el.querySelector('.journal-evidence')!;
    const countEl = this.el.querySelector('.journal-count')!;
    countEl.textContent = L(`${entries.length}개의 기록`, `${entries.length}件の記録`);
    const areas = (Object.keys(AREA_NAME) as EvidenceEntry['area'][]).filter((area) => entries.some((e) => e.area === area));
    if (this.selectedArea !== 'all' && !areas.includes(this.selectedArea)) this.selectedArea = 'all';
    this.el.querySelector('.journal-filters')!.innerHTML = [
      {id:'all', name:L('전체', 'すべて'), count:entries.length},
      ...areas.map(area=>({id:area,name:AREA_NAME[area],count:entries.filter(e=>e.area===area).length})),
    ].map(area=>`<button type="button" data-area="${area.id}" aria-pressed="${this.selectedArea===area.id}">${esc(area.name)}<span>${area.count}</span></button>`).join('');
    evidenceEl.innerHTML = areas.filter(area=>this.selectedArea==='all'||area===this.selectedArea).map((area) => {
      const cards = entries.filter((e) => e.area === area).map((e) => `
        <article class="journal-entry${e.id === this.latest ? ' latest' : ''}">
          <h4>${esc(e.title)}</h4><p>${esc(e.detail)}</p>
        </article>`).join('');
      return `<section class="journal-area"><h3>${esc(AREA_NAME[area])}</h3>${cards}</section>`;
    }).join('');

    const theories: string[] = [];
    const v = [...found].filter((id) => id.startsWith('village:')).length;
    if (v >= 2 && !found.has('inference:village-complete')) theories.push(L('생활이 갑자기 끊긴 흔적들이 닮았다. 같은 사건의 흔적일까?', '暮らしが突然途切れた痕が似ている。同じ事件の痕なのだろうか。'));
    if (found.has('inference:village-mimic')) theories.push(L('이 마을의 목소리는 진짜 화자의 의도와 다를 수 있다. 대답하기 전에 물증과 대조할 것.', 'この村の声は本当の話者の意図と違う可能性がある。返事の前に物証と照合する。'));
    if (found.has('inference:village-sealed')) theories.push(L('마을은 폐허가 아니라 봉인된 사건 현장에 가깝다.', '村は廃墟というより、封じられた事件現場に近い。'));
    if (found.has('inference:village-complete')) theories.push(L('흔적을 남긴 의도가 있을 수 있다. 부르는 목소리와 멈추라는 경고를 구별해야 한다.', '痕を残した意図があるかもしれない。呼ぶ声と止める警告を区別したい。'));
    if (found.has('memory:bell')) theories.push(L('과거의 목소리도 지금의 목표도 공물을 옮기라고 한다. 내 기억을 다른 기록과 대조해야 한다.', '昔の声も今の目標も供物を動かせと言う。自分の記憶を別の記録と照合したい。'));
    if (found.has('truth:villagers')) theories.push(L('방울을 집은 기억과 주민들이 선택한 책임은 같은 것이 아니다. 신사에서 아직 확인하지 못한 일이 남았다.', '鈴を取った記憶と村人たちが選んだ責任は同じではない。社でまだ確かめていないことが残る。'));
    if ([...found].filter((id) => id.startsWith('suzu:')).length >= 2) theories.push(L('붉은 끈은 방울의 도난 방지가 아니라 아래의 존재를 묶는 봉인이다.', '赤い糸は鈴の盗難防止でなく、下の存在を縛る封印だ。'));
    if (found.has('school:called')) theories.push(L('가짜 목소리를 끊는 방법은 침묵만이 아니다. 빼앗긴 진짜 이름을 돌려주는 것도 가능하다.', '偽の声を断つ方法は沈黙だけではない。奪われた本当の名を返すこともできる。'));
    if (found.has('well:child-call')) theories.push(L('우물의 여자는 아이를 해친 원혼이 아니라, 아직 아이를 찾는 어머니일 가능성이 높다.', '井戸の女は子供を害した怨霊ではなく、今も子供を捜す母親である可能性が高い。'));
    if (found.has('manor:seal')) theories.push(L('공물을 신사로 옮길수록 봉인은 약해진다. 지금까지의 “퀘스트”는 거짓말이었다.', '供物を社へ運ぶほど封印は弱まる。これまでの「クエスト」は嘘だった。'));
    const theoryEl = this.el.querySelector('.journal-theories')!;
    theoryEl.innerHTML = `<h3>${L('현재 가설', '現在の仮説')}</h3>` + (theories.length
      ? theories.map((t, i) => `<article><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(t)}</p></article>`).join('')
      : `<p class="journal-empty">${L('단서가 더 필요하다.', '手掛かりが足りない。')}</p>`);
  }
}
