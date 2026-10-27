import { describe, expect, it } from 'vitest';
import { plainCopy } from '../src/bridge/copy';
import { createOutbox, SLICE, WATCHDOG } from '../src/bridge/outbox';
import { CHANNEL, type BridgeMessage } from '../src/bridge/protocol';
import type { Scheduler } from '../src/bridge/schedule';
import { toTransfer } from '../src/bridge/serialize';

function manualScheduler() {
  type Job = { run: () => void; live: boolean; ms?: number };
  const frames: Job[] = [];
  const tasks: Job[] = [];
  const timers: Job[] = [];
  const add = (list: Job[], run: () => void, ms?: number) => {
    const job = { run, live: true, ms };
    list.push(job);
    return () => {
      job.live = false;
    };
  };
  const runAll = (list: Job[]) => {
    const jobs = list.splice(0);
    for (const job of jobs) if (job.live) job.run();
    return jobs.filter((job) => job.live).length;
  };
  const scheduler: Scheduler = {
    frame: (run) => add(frames, run),
    task: (run) => add(tasks, run),
    timer: (run, ms) => add(timers, run, ms),
  };
  return {
    scheduler,
    frame: () => runAll(frames),
    task: () => runAll(tasks),
    timer: () => runAll(timers),
    pending: () => ({ frames: frames.filter((j) => j.live).length, tasks: tasks.filter((j) => j.live).length, timers: timers.filter((j) => j.live).length }),
    timerDelays: () => timers.filter((j) => j.live).map((j) => j.ms),
  };
}

const status = (connected: boolean): BridgeMessage => ({ channel: CHANNEL, kind: 'status', connected, version: connected ? 1 : null });

const built = (i: number) => ({ path: [0, i], type: 'Row', tag: 'div', duration: 0.1 });

function setup() {
  const sent: BridgeMessage[] = [];
  const clock = manualScheduler();
  const outbox = createOutbox((message) => sent.push(message), clock.scheduler);
  const events = () => sent.flatMap((m) => (m.kind === 'events' ? m.events : []));
  return { sent, clock, outbox, events };
}

describe('outbox', () => {
  it('waits for the next frame and sends the queued events after it in one message', () => {
    const { sent, clock, outbox, events } = setup();
    outbox.event('component:built', built(0), 10);
    outbox.event('component:built', built(1), 11);
    expect(sent).toEqual([]);
    clock.frame();
    expect(sent).toEqual([]);
    clock.task();
    expect(sent).toHaveLength(1);
    expect(events()).toEqual([
      { type: 'component:built', payload: built(0), time: 10 },
      { type: 'component:built', payload: built(1), time: 11 },
    ]);
    expect(clock.pending()).toEqual({ frames: 0, tasks: 0, timers: 0 });
  });

  it('starts from the watchdog when no frame comes', () => {
    const { clock, outbox, events } = setup();
    outbox.event('component:built', built(0), 1);
    expect(clock.timerDelays()).toEqual([WATCHDOG]);
    clock.timer();
    expect(events()).toHaveLength(1);
    expect(clock.pending().frames).toBe(0);
  });

  it('sends slices of at most one thousand events, one per task', () => {
    const { sent, clock, outbox, events } = setup();
    for (let i = 0; i < SLICE * 2 + 500; i++) outbox.event('component:built', built(i), i);
    clock.frame();
    clock.task();
    expect(sent).toHaveLength(1);
    expect(events()).toHaveLength(SLICE);
    clock.task();
    clock.task();
    expect(sent.map((m) => (m.kind === 'events' ? m.events.length : 0))).toEqual([SLICE, SLICE, 500]);
    expect(events().map((e) => e.time)).toEqual([...Array(SLICE * 2 + 500).keys()]);
    expect(outbox.size).toBe(0);
  });

  it('waits for a frame again when the app added events between two slices', () => {
    const { clock, outbox, events } = setup();
    for (let i = 0; i < SLICE + 10; i++) outbox.event('component:built', built(i), i);
    clock.frame();
    clock.task();
    outbox.event('component:built', built(9999), 9999);
    clock.task();
    expect(events()).toHaveLength(SLICE);
    expect(clock.pending().frames).toBe(1);
    clock.frame();
    clock.task();
    expect(events()).toHaveLength(SLICE + 11);
    expect(events().at(-1)?.time).toBe(9999);
  });

  it('sends the status at once when nothing waits and in order behind waiting events', () => {
    const { sent, clock, outbox } = setup();
    outbox.message(status(true));
    expect(sent).toEqual([status(true)]);
    outbox.event('component:built', built(0), 1);
    outbox.message(status(false));
    outbox.event('component:built', built(1), 2);
    expect(sent).toHaveLength(1);
    clock.frame();
    clock.task();
    expect(sent.map((m) => (m.kind === 'events' ? m.events.map((e) => e.time) : m.kind))).toEqual(['status', [1], 'status', [2]]);
  });

  it('copies rare events when they happen and frequent ones when they are sent', () => {
    const { clock, outbox, events } = setup();
    const details = { field: 'before' };
    const ref = { path: [0], type: 'Row', tag: 'div', duration: 1 };
    outbox.event('warning', { code: 'MJX1', message: 'm', details }, 1);
    outbox.event('component:built', ref, 2);
    details.field = 'after';
    ref.duration = 2;
    clock.frame();
    clock.task();
    expect(events()[0].payload).toEqual({ code: 'MJX1', message: 'm', details: { field: 'before' } });
    expect(events()[1].payload).toEqual({ path: [0], type: 'Row', tag: 'div', duration: 2 });
  });

  it('drops what waits when it is cleared', () => {
    const { sent, clock, outbox } = setup();
    outbox.event('component:built', built(0), 1);
    outbox.clear();
    expect(clock.pending()).toEqual({ frames: 0, tasks: 0, timers: 0 });
    clock.frame();
    clock.task();
    clock.timer();
    expect(sent).toEqual([]);
    outbox.message(status(true));
    expect(sent).toEqual([status(true)]);
  });
});

describe('plainCopy', () => {
  const cases: [string, unknown, number][] = [
    ['component ref', { path: [0, 3, 1], type: 'Row', tag: 'div', duration: 0.25 }, 4],
    ['detached ref', { path: null, type: 'Row', tag: 'div' }, 4],
    ['tree change', { parents: [[0], [0, 2]] }, 4],
    ['flush', { duration: 1, runs: 2, triggers: [{ target: { kind: 'object' }, key: 'n', count: 1, store: { id: 1, path: ['a'] } }], effects: [{ path: [0], type: 'A', tag: 'b', kind: 'class', runs: 1 }] }, 6],
    ['odd numbers', { a: Number.NaN, b: -0, c: Infinity, d: [1, Number.NaN], e: [1, -0] }, 4],
    ['undefined and nested', { a: undefined, b: { c: { d: { e: { f: 1 } } } } }, 4],
    ['long array', { path: [...Array(150).keys()] }, 4],
    ['mark key', { $motif: 'x', a: 1 }, 4],
    ['not plain', new Map([[1, 2]]), 4],
    ['primitive', 'text', 4],
    ['undefined', undefined, 4],
    ['shallow depth', { path: [1, 2] }, 1],
  ];
  for (const [name, value, depth] of cases) {
    it(`matches toTransfer for ${name}`, () => {
      expect(plainCopy(value, depth)).toEqual(toTransfer(value, depth));
    });
  }

  it('matches toTransfer for a getter and a circular reference', () => {
    const withGetter = Object.defineProperty({ a: 1 }, 'b', { enumerable: true, get: () => 2 });
    expect(plainCopy(withGetter, 4)).toEqual(toTransfer(withGetter, 4));
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    circular.child = { up: circular };
    expect(plainCopy(circular, 4)).toEqual(toTransfer(circular, 4));
  });

  it('copies the path instead of sharing it', () => {
    const path = [0, 1];
    const copy = plainCopy({ path }, 4) as { path: number[] };
    expect(copy.path).toEqual(path);
    expect(copy.path).not.toBe(path);
  });
});
