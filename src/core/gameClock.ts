/** 프레임에서만 진행하는 대기. 일시정지 중에는 update를 호출하지 않는다. */
export class GameClock {
  private time = 0;
  private waits: { at: number; done: () => void }[] = [];
  wait(ms: number): Promise<void> {
    return new Promise((done) => this.waits.push({ at: this.time + Math.max(0, ms) / 1000, done }));
  }
  update(dt: number) {
    this.time += Math.max(0, dt);
    if (this.waits.length === 0) return;
    const pending = this.waits;
    this.waits = [];
    for (const wait of pending) {
      if (wait.at <= this.time) wait.done();
      else this.waits.push(wait);
    }
  }
}
