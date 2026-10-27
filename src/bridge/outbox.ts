import { plainCopy } from './copy';
import { CHANNEL, type BridgeEventData, type BridgeMessage } from './protocol';
import { defaultScheduler, type Cancel, type Scheduler } from './schedule';
import { toTransfer } from './serialize';

export const SLICE = 500;
export const WATCHDOG = 1000;
export const DEFERRED = new Set(['component:built', 'component:visibility', 'component:wait', 'component:disposing', 'component:disposed', 'tree:changed', 'reactivity:flush']);

const depthOf = (type: string) => (type === 'reactivity:flush' ? 6 : 4);

type Entry = { type: string; payload: unknown; time: number; deferred: boolean } | { message: BridgeMessage };

export interface Outbox {
  readonly size: number;
  event(type: string, payload: unknown, time: number): void;
  message(message: BridgeMessage): void;
  clear(): void;
}

export function createOutbox(send: (message: BridgeMessage) => void, scheduler: Scheduler = defaultScheduler()): Outbox {
  let queue: Entry[] = [];
  let cancels: Cancel[] = [];
  let arrived = 0;
  let busy = false;

  const stop = () => {
    for (const cancel of cancels) cancel();
    cancels = [];
  };

  const gate = () => {
    stop();
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      stop();
      drain();
    };
    cancels = [scheduler.frame(() => cancels.push(scheduler.task(start))), scheduler.timer(start, WATCHDOG)];
  };

  const drain = () => {
    arrived = 0;
    const batch = queue.splice(0, SLICE);
    let events: BridgeEventData[] = [];
    const flush = () => {
      if (events.length === 0) return;
      send({ channel: CHANNEL, kind: 'events', events });
      events = [];
    };
    for (const entry of batch) {
      if ('message' in entry) {
        flush();
        send(entry.message);
      } else {
        events.push({ type: entry.type, payload: entry.deferred ? plainCopy(entry.payload, depthOf(entry.type)) : entry.payload, time: entry.time });
      }
    }
    flush();
    if (queue.length === 0) {
      busy = false;
      return;
    }
    cancels = [scheduler.task(() => (arrived > 0 ? gate() : drain()))];
  };

  const push = (entry: Entry) => {
    queue.push(entry);
    arrived++;
    if (busy) return;
    busy = true;
    gate();
  };

  return {
    get size() {
      return queue.length;
    },
    event(type, payload, time) {
      const deferred = DEFERRED.has(type);
      push({ type, payload: deferred ? payload : toTransfer(payload, depthOf(type)), time, deferred });
    },
    message(message) {
      if (!busy) send(message);
      else push({ message });
    },
    clear() {
      stop();
      queue = [];
      arrived = 0;
      busy = false;
    },
  };
}
