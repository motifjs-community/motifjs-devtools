export const READ_GAP = 250;
export const READ_FACTOR = 4;

export class Reader {
  private running = false;
  private again = false;
  private stale = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastEnd = Number.NEGATIVE_INFINITY;
  private lastCycle = 0;
  private waiting: (() => void)[] = [];
  private next: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly run: () => Promise<unknown>,
    private readonly active: () => boolean,
    private readonly gap = READ_GAP,
  ) {}

  request(now = false): Promise<void> {
    return new Promise((resolve) => {
      if (this.disposed || !this.active()) {
        this.stale = !this.disposed;
        resolve();
        return;
      }
      this.next.push(resolve);
      if (this.running) {
        this.again = true;
        return;
      }
      if (now) {
        this.start();
        return;
      }
      this.schedule();
    });
  }

  wake() {
    if (this.stale && this.active()) void this.request(true);
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const resolve of [...this.waiting, ...this.next]) resolve();
    this.waiting = [];
    this.next = [];
  }

  private schedule() {
    const wait = this.gap <= 0 ? 0 : this.lastEnd + Math.max(this.gap, READ_FACTOR * this.lastCycle) - Date.now();
    if (wait <= 0) {
      this.start();
      return;
    }
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.disposed || this.running) return;
      if (!this.active()) {
        this.stale = true;
        this.release(this.next.splice(0));
        return;
      }
      this.start();
    }, wait);
  }

  private start() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.running = true;
    this.stale = false;
    this.waiting = this.next;
    this.next = [];
    const startedAt = Date.now();
    const finish = () => {
      this.running = false;
      this.lastEnd = Date.now();
      this.lastCycle = this.lastEnd - startedAt;
      this.release(this.waiting);
      this.waiting = [];
      if (this.disposed) return;
      if (this.again) {
        this.again = false;
        if (this.active()) this.schedule();
        else {
          this.stale = true;
          this.release(this.next.splice(0));
        }
      }
    };
    this.run().then(finish, finish);
  }

  private release(resolvers: (() => void)[]) {
    for (const resolve of resolvers) resolve();
  }
}
