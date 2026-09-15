interface Layer {
  root: HTMLElement;
  previous: Element | null;
  escape?: () => void;
  tab?: () => void;
}

/** 열린 UI의 입력 소유권. 아래 창은 inert로 만들고 게임의 전역 키 핸들러도 같은 상태를 본다. */
export class ModalInput {
  private layers: Layer[] = [];
  private listeners = new Set<() => void>();
  get active() { return this.layers.length > 0; }
  allows(root?: HTMLElement) { return !this.active || this.layers.at(-1)!.root === root; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  open(root: HTMLElement, escape?: () => void, tab?: () => void) {
    if (this.layers.some((layer) => layer.root === root)) return;
    if (!this.active) window.addEventListener('keydown', this.key, true);
    this.layers.push({ root, previous: document.activeElement, escape, tab });
    root.setAttribute('role', root.getAttribute('role') ?? 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.tabIndex = -1;
    this.sync();
    this.focus(root);
  }

  close(root: HTMLElement) {
    const index = this.layers.findIndex((layer) => layer.root === root);
    if (index < 0) return;
    const wasTop = index === this.layers.length - 1;
    const [removed] = this.layers.splice(index, 1);
    root.inert = false;
    root.removeAttribute('aria-modal');
    this.sync();
    if (!this.active) window.removeEventListener('keydown', this.key, true);
    if (!wasTop) return;
    const top = this.layers.at(-1)?.root;
    const previous = removed!.previous as HTMLElement | null;
    if (previous?.isConnected && (!top || top.contains(previous)) && !previous.closest('[inert], .hidden, [hidden]')) {
      previous.focus();
    } else if (top) this.focus(top);
  }

  private sync() {
    for (const layer of this.layers) layer.root.inert = !this.allows(layer.root);
    for (const notify of this.listeners) notify();
  }
  private controls(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], .hidden, [inert]') && el.getClientRects().length > 0);
  }
  private focus(root: HTMLElement) { (this.controls(root)[0] ?? root).focus(); }
  private key = (event: KeyboardEvent) => {
    const layer = this.layers.at(-1);
    if (!layer) return;
    if (event.code === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) layer.escape?.();
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (layer.tab) { if (!event.repeat) layer.tab(); return; }
      const controls = this.controls(layer.root);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      (controls[next] ?? layer.root).focus();
    } else if (!(event.target instanceof Node) || !layer.root.contains(event.target)) {
      // 스크립트/포인터락 해제로 포커스가 밖에 남은 경우 입력을 아래 화면으로 보내지 않는다.
      event.preventDefault(); event.stopImmediatePropagation();
      this.focus(layer.root);
    }
  };
}

export const modalInput = new ModalInput();
