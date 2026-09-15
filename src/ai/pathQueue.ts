/** 같은 개체의 요청을 합치고 프레임당 한 탐색만 실행한다. 이동·감지 시계는 매 프레임 유지한다. */
export class PathQueue {
  private jobs = new Map<object, () => void>();
  has(owner: object) { return this.jobs.has(owner); }
  request(owner: object, work: () => void) { this.jobs.set(owner, work); }
  cancel(owner: object) { this.jobs.delete(owner); }
  update() {
    const first = this.jobs.entries().next();
    if (first.done) return;
    const [owner, work] = first.value;
    this.jobs.delete(owner);
    work();
  }
}
