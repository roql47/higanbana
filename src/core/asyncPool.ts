/** 다운로드·디코딩 작업을 한꺼번에 시작하지 않는 FIFO 작업 풀. */
export class AsyncPool {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency limit');
  }
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.active++;
        void Promise.resolve().then(task).then(resolve, reject).finally(() => {
          this.active--;
          this.pump();
        });
      });
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.limit && this.queue.length) this.queue.shift()!();
  }
}
