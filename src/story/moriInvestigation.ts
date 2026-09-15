export const MORI_TRACES = ['tea','tv','geta','bell','alley'] as const;
export type MoriTrace = typeof MORI_TRACES[number];
/** A replay or the optional guide can never advance the three-trace gate. */
export class MoriInvestigation {
  readonly found = new Set<MoriTrace>();
  guideRead = false;
  discover(id: MoriTrace) { const fresh=!this.found.has(id);this.found.add(id);return fresh; }
  get ready() { return this.found.size >= 3; }
  get conclusion() {
    if(this.found.size===5)return '흔적들이 너무 잘 보이는 곳에 남아 있어. 내가 찾아내기를 기다린 것처럼…';
    if(['tv','bell','alley'].every(id=>this.found.has(id as MoriTrace)))return '화면도, 소리도… 사람이 있는 척하고 있어.';
    if(['tea','tv','geta'].every(id=>this.found.has(id as MoriTrace)))return '방금 전까지 누군가 있었어. 그런데 나간 흔적이 없어.';
    return '흔적이 전부 안쪽을 향해 있어. 사람들이 나가지 못한 걸까?';
  }
}
