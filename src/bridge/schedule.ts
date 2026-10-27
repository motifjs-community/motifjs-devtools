export type Cancel = () => void;

export interface Scheduler {
  frame(run: () => void): Cancel;
  task(run: () => void): Cancel;
  timer(run: () => void, ms: number): Cancel;
}

export function taskRunner(): (run: () => void) => Cancel {
  if (typeof MessageChannel !== 'function') {
    return (run) => {
      const id = setTimeout(run, 0);
      return () => clearTimeout(id);
    };
  }
  const channel = new MessageChannel();
  const pending: { run: () => void; live: boolean }[] = [];
  channel.port1.onmessage = () => {
    const item = pending.shift();
    if (item !== undefined && item.live) item.run();
  };
  (channel.port1 as { unref?: () => void }).unref?.();
  (channel.port2 as { unref?: () => void }).unref?.();
  return (run) => {
    const item = { run, live: true };
    pending.push(item);
    channel.port2.postMessage(null);
    return () => {
      item.live = false;
    };
  };
}

export function defaultScheduler(): Scheduler {
  const task = taskRunner();
  const timer = (run: () => void, ms: number): Cancel => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  };
  const frame =
    typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function'
      ? (run: () => void): Cancel => {
          const id = requestAnimationFrame(() => run());
          return () => cancelAnimationFrame(id);
        }
      : (): Cancel => () => {};
  return { frame, task, timer };
}
