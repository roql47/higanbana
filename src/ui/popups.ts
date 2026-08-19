import * as THREE from 'three';

/** 월드 좌표에 붙는 데미지 숫자 팝업 (HTML). 매 프레임 카메라로 투영. */
export class Popups {
  private layer: HTMLElement;
  private items: { el: HTMLElement; pos: THREE.Vector3; born: number }[] = [];
  private tmp = new THREE.Vector3();

  constructor(private camera: THREE.Camera) {
    this.layer = document.createElement('div');
    this.layer.id = 'popups';
    document.body.appendChild(this.layer);
  }

  damage(worldPos: THREE.Vector3, amount: number, crit = false) {
    const el = document.createElement('div');
    el.className = 'dmg' + (crit ? ' crit' : '');
    el.textContent = String(Math.round(amount));
    this.layer.appendChild(el);
    this.items.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), born: performance.now() });
  }

  update() {
    const now = performance.now();
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (now - it.born > 850) { it.el.remove(); this.items.splice(i, 1); continue; }
      this.tmp.copy(it.pos).project(this.camera);
      const behind = this.tmp.z > 1;
      it.el.style.display = behind ? 'none' : '';
      it.el.style.left = `${(this.tmp.x * 0.5 + 0.5) * w}px`;
      it.el.style.top = `${(-this.tmp.y * 0.5 + 0.5) * h}px`;
    }
  }
}
