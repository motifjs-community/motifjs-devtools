import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';

export type FlushEffect = { path: number[] | null; type: string | null; tag: string | null; kind: string; runs: number };
export type FlushTrigger = { target: unknown; key: string; count: number; store?: { id: number; path: string[] } };

export type Flush = {
  id: number;
  at: number;
  duration: number;
  runs: number;
  effects: FlushEffect[];
  triggers: FlushTrigger[];
};

type FlushPayload = { duration?: number; runs?: number; effects?: FlushEffect[]; triggers?: FlushTrigger[] };

export const MAX_FLUSHES = 200;
const MINUTE = 60_000;

export class ReactivityModel {
  readonly state = reactive({
    flushes: [] as Flush[],
    paused: false,
    expanded: null as number | null,
    now: Date.now(),
  });

  private nextId = 1;
  private readonly off: () => void;
  private readonly clock: ReturnType<typeof setInterval>;

  constructor(client: Client, private readonly time: () => number = Date.now) {
    this.off = client.onEvent((event) => {
      if (event.type === 'reactivity:flush') this.add(event.payload as FlushPayload);
    });
    this.clock = setInterval(() => {
      this.state.now = this.time();
    }, 5_000);
  }

  get lastMinuteRuns() {
    const since = this.state.now - MINUTE;
    let total = 0;
    for (const flush of this.state.flushes) {
      if (flush.at < since) break;
      total += flush.runs;
    }
    return total;
  }

  get maxDuration() {
    let max = 0;
    for (const flush of this.state.flushes) max = Math.max(max, flush.duration);
    return max;
  }

  togglePause() {
    this.state.paused = !this.state.paused;
  }

  clear() {
    this.state.flushes.splice(0, this.state.flushes.length);
    this.state.expanded = null;
  }

  toggle(id: number) {
    this.state.expanded = this.state.expanded === id ? null : id;
  }

  dispose() {
    this.off();
    clearInterval(this.clock);
  }

  private add(payload: FlushPayload) {
    if (this.state.paused || payload === null || typeof payload !== 'object') return;
    const at = this.time();
    this.state.now = at;
    this.state.flushes.unshift({
      id: this.nextId++,
      at,
      duration: Number(payload.duration) || 0,
      runs: Number(payload.runs) || 0,
      effects: Array.isArray(payload.effects) ? payload.effects : [],
      triggers: Array.isArray(payload.triggers) ? payload.triggers : [],
    });
    if (this.state.flushes.length > MAX_FLUSHES) this.state.flushes.splice(MAX_FLUSHES);
  }
}
