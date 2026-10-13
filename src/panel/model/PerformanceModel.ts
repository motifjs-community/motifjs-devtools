import { reactive } from '@motifx/core';
import type { PageMemory } from '../../bridge/protocol';
import type { Client, ClientEvent } from '../../client/client';
import type { Counters } from './DevtoolsModel';
import type { FlushTrigger } from './ReactivityModel';

export type TimelineKind = 'navigation' | 'flush' | 'build' | 'dispose';
export type KindFilter = TimelineKind | 'all';

export type TypeStat = { type: string; count: number; total: number; max: number };

export type TimelineEntry = {
  id: number;
  kind: TimelineKind;
  start: number;
  end: number;
  duration: number;
  count: number;
  types?: TypeStat[];
  effects?: number;
  triggers?: FlushTrigger[];
  uri?: string;
  requested?: string;
  outcome?: string;
  reason?: string;
};

export type Sample = {
  at: number;
  used: number | null;
  total: number | null;
  limit: number | null;
  live: number | null;
  inTree: number | null;
  notInTree: number | null;
};

export type Range = { from: number; to: number };

export const KINDS: TimelineKind[] = ['navigation', 'flush', 'build', 'dispose'];
export const KIND_LABELS: Record<TimelineKind, string> = { navigation: 'Navigation', flush: 'Reactivity', build: 'Build', dispose: 'Dispose' };
export const kindLabel = (kind: TimelineKind) => KIND_LABELS[kind];
export const WINDOWS = [10_000, 30_000, 60_000, 300_000];
export const SAMPLE_INTERVAL = 2_000;
export const HISTORY = 300_000;
export const MAX_SAMPLES = HISTORY / SAMPLE_INTERVAL;
export const MAX_ENTRIES = 2_000;
export const LIST_LIMIT = 200;
export const TOP = 8;

const GAP = 10;
const SETTLE = 60;
const COMMIT_DELAY = 100;
const CLOCK = 1_000;
const AFTER_NAVIGATION = 1_000;
const RISING_NAVIGATIONS = 3;
const MIN_CHART = 60_000;

type Open = { kind: 'build' | 'dispose'; start: number; end: number; count: number; types: Map<string, TypeStat>; touched: number };
type Ref = { type?: string; tag?: string; duration?: number };
type Navigation = { uri?: string; requested?: string; outcome?: string; reason?: string; duration?: number };
type FlushPayload = { duration?: number; runs?: number; effects?: unknown[]; triggers?: FlushTrigger[] };

const sortTypes = (types: Iterable<TypeStat>) => [...types].sort((a, b) => b.max - a.max || b.count - a.count);

const overlaps = (entry: { start: number; end: number }, range: Range | null) => range === null || (entry.end >= range.from && entry.start <= range.to);

export class PerformanceModel {
  readonly state = reactive({
    entries: [] as TimelineEntry[],
    samples: [] as Sample[],
    memory: null as boolean | null,
    paused: false,
    window: 60_000,
    kind: 'all' as KindFilter,
    selection: null as Range | null,
    expanded: null as number | null,
    now: Date.now(),
  });

  private nextId = 1;
  private open: Open[] = [];
  private queue: TimelineEntry[] = [];
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private readonly off: () => void;

  constructor(
    private readonly client: Client,
    private readonly counters: () => Counters | null,
    private readonly time: () => number = Date.now,
    interval = SAMPLE_INTERVAL,
  ) {
    this.state.now = time();
    this.off = client.onEvent((event) => this.receive(event));
    if (interval > 0) {
      this.timers.push(
        setInterval(() => void this.sample(), interval),
        setInterval(() => {
          if (!this.state.paused) this.state.now = this.time();
        }, CLOCK),
      );
    }
  }

  get latest(): Sample | null {
    const samples = this.state.samples;
    return samples.length === 0 ? null : samples[samples.length - 1];
  }

  get chartSpan() {
    const first = this.state.samples[0];
    return first === undefined ? MIN_CHART : Math.min(HISTORY, Math.max(MIN_CHART, this.state.now - first.at));
  }

  get listed() {
    const { kind, selection } = this.state;
    const out: TimelineEntry[] = [];
    for (const entry of this.state.entries) {
      if ((kind === 'all' || entry.kind === kind) && overlaps(entry, selection)) out.push(entry);
      if (out.length === LIST_LIMIT) break;
    }
    return out;
  }

  get listedTotal() {
    const { kind, selection } = this.state;
    let total = 0;
    for (const entry of this.state.entries) if ((kind === 'all' || entry.kind === kind) && overlaps(entry, selection)) total++;
    return total;
  }

  get maxListedDuration() {
    let max = 0;
    for (const entry of this.listed) max = Math.max(max, entry.duration);
    return max;
  }

  get slowestTypes(): TypeStat[] {
    const merged = new Map<string, TypeStat>();
    for (const entry of this.inRange('build')) {
      for (const stat of entry.types ?? []) {
        const into = merged.get(stat.type);
        if (into === undefined) merged.set(stat.type, { ...stat });
        else {
          into.count += stat.count;
          into.total += stat.total;
          into.max = Math.max(into.max, stat.max);
        }
      }
    }
    return sortTypes(merged.values()).slice(0, TOP);
  }

  get longestFlushes() {
    return this.longest('flush');
  }

  get longestNavigations() {
    return this.longest('navigation');
  }

  get rising(): boolean {
    const navigations = this.state.entries.filter((e) => e.kind === 'navigation' && e.outcome === 'done').reverse();
    if (navigations.length < RISING_NAVIGATIONS + 1) return false;
    const values: number[] = [];
    for (const navigation of navigations.slice(-(RISING_NAVIGATIONS + 1))) {
      const sample = this.state.samples.find((s) => s.at >= navigation.end + AFTER_NAVIGATION && s.notInTree !== null);
      if (sample === undefined) return false;
      values.push(sample.notInTree!);
    }
    return values.every((value, index) => index === 0 || value > values[index - 1]);
  }

  setWindow(window: number) {
    this.state.window = window;
  }

  setKind(kind: KindFilter) {
    this.state.kind = kind;
  }

  select(from: number, to: number) {
    this.state.selection = to - from < 1 ? null : { from: Math.min(from, to), to: Math.max(from, to) };
    this.state.expanded = null;
  }

  clearSelection() {
    this.state.selection = null;
  }

  toggle(id: number) {
    this.state.expanded = this.state.expanded === id ? null : id;
  }

  focus(id: number) {
    const entry = this.state.entries.find((e) => e.id === id);
    if (entry === undefined) return;
    if (this.state.kind !== 'all' && this.state.kind !== entry.kind) this.state.kind = 'all';
    if (!overlaps(entry, this.state.selection)) this.state.selection = null;
    this.state.expanded = id;
  }

  togglePause() {
    this.state.paused = !this.state.paused;
    if (!this.state.paused) this.state.now = this.time();
  }

  clear() {
    this.open = [];
    this.queue = [];
    this.state.entries.splice(0, this.state.entries.length);
    this.state.samples.splice(0, this.state.samples.length);
    this.state.selection = null;
    this.state.expanded = null;
  }

  async sample() {
    if (this.state.paused || !this.client.status.connected) return;
    let memory: PageMemory | null = null;
    try {
      memory = await this.client.request<PageMemory | null>('getMemory');
    } catch {}
    if (this.state.paused) return;
    const counters = this.counters();
    const at = this.time();
    this.state.memory = memory !== null && typeof memory === 'object';
    this.state.samples.push({
      at,
      used: this.state.memory ? memory!.used : null,
      total: this.state.memory ? memory!.total : null,
      limit: this.state.memory ? memory!.limit : null,
      live: counters?.components.live ?? null,
      inTree: counters?.components.inTree ?? null,
      notInTree: counters?.components.notInTree ?? null,
    });
    const keep = this.state.samples.findIndex((s) => s.at >= at - HISTORY);
    if (keep > 0) this.state.samples.splice(0, keep);
    if (this.state.samples.length > MAX_SAMPLES) this.state.samples.splice(0, this.state.samples.length - MAX_SAMPLES);
  }

  commit(force = false) {
    if (this.commitTimer !== null) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
    const now = this.time();
    const ready = this.queue;
    this.queue = [];
    this.open = this.open.filter((group) => {
      if (!force && now - group.touched < SETTLE) return true;
      ready.push(this.entryOf(group));
      return false;
    });
    if (ready.length > 0) this.insert(ready);
    if (this.open.length > 0) this.scheduleCommit();
  }

  dispose() {
    this.off();
    for (const timer of this.timers) clearInterval(timer);
    if (this.commitTimer !== null) clearTimeout(this.commitTimer);
  }

  private inRange(kind: TimelineKind) {
    const selection = this.state.selection;
    return this.state.entries.filter((e) => e.kind === kind && overlaps(e, selection));
  }

  private longest(kind: TimelineKind) {
    return this.inRange(kind)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, TOP);
  }

  private receive(event: ClientEvent) {
    if (this.state.paused) return;
    const at = typeof event.time === 'number' ? event.time : this.time();
    const payload = event.payload as Record<string, unknown> | null | undefined;
    if (payload === null || typeof payload !== 'object') return;
    switch (event.type) {
      case 'component:built':
        return this.group('build', at, payload as Ref);
      case 'component:disposed':
        return this.group('dispose', at, payload as Ref);
      case 'reactivity:flush': {
        const flush = payload as FlushPayload;
        const duration = Number(flush.duration) || 0;
        return this.enqueue({
          id: this.nextId++,
          kind: 'flush',
          start: at - duration,
          end: at,
          duration,
          count: Number(flush.runs) || 0,
          effects: Array.isArray(flush.effects) ? flush.effects.length : 0,
          triggers: Array.isArray(flush.triggers) ? flush.triggers : [],
        });
      }
      case 'route:navigation-end': {
        const navigation = payload as Navigation;
        const duration = Number(navigation.duration) || 0;
        const entry: TimelineEntry = { id: this.nextId++, kind: 'navigation', start: at - duration, end: at, duration, count: 1, uri: String(navigation.uri ?? '') };
        if (typeof navigation.requested === 'string' && navigation.requested !== entry.uri) entry.requested = navigation.requested;
        if (typeof navigation.outcome === 'string') entry.outcome = navigation.outcome;
        if (typeof navigation.reason === 'string') entry.reason = navigation.reason;
        return this.enqueue(entry);
      }
    }
  }

  private group(kind: 'build' | 'dispose', at: number, ref: Ref) {
    const duration = Math.max(0, Number(ref.duration) || 0);
    const start = at - duration;
    const type = ref.type === 'Component' && typeof ref.tag === 'string' ? (ref.tag.startsWith('#') ? ref.tag : `<${ref.tag}>`) : typeof ref.type === 'string' ? ref.type : 'Component';
    let target: Open | null = null;
    for (let i = this.open.length - 1; i >= 0; i--) {
      const group = this.open[i];
      if (group.kind !== kind || start > group.end + GAP || at < group.start - GAP) continue;
      if (target === null) {
        target = group;
        continue;
      }
      target.start = Math.min(target.start, group.start);
      target.end = Math.max(target.end, group.end);
      target.count += group.count;
      for (const stat of group.types.values()) this.addStat(target, stat.type, stat.count, stat.total, stat.max);
      this.open.splice(i, 1);
    }
    if (target === null) {
      target = { kind, start, end: at, count: 0, types: new Map(), touched: 0 };
      this.open.push(target);
    }
    target.start = Math.min(target.start, start);
    target.end = Math.max(target.end, at);
    target.count++;
    target.touched = this.time();
    this.addStat(target, type, 1, duration, duration);
    this.scheduleCommit();
  }

  private addStat(group: Open, type: string, count: number, total: number, max: number) {
    const stat = group.types.get(type);
    if (stat === undefined) group.types.set(type, { type, count, total, max });
    else {
      stat.count += count;
      stat.total += total;
      stat.max = Math.max(stat.max, max);
    }
  }

  private entryOf(group: Open): TimelineEntry {
    return {
      id: this.nextId++,
      kind: group.kind,
      start: group.start,
      end: group.end,
      duration: group.end - group.start,
      count: group.count,
      types: sortTypes(group.types.values()),
    };
  }

  private enqueue(entry: TimelineEntry) {
    this.queue.push(entry);
    this.scheduleCommit();
  }

  private scheduleCommit() {
    if (this.commitTimer !== null) return;
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      this.commit();
    }, COMMIT_DELAY);
  }

  private insert(ready: TimelineEntry[]) {
    const entries = this.state.entries;
    ready.sort((a, b) => a.start - b.start);
    for (const entry of ready) {
      let index = 0;
      while (index < entries.length && entries[index].start > entry.start) index++;
      entries.splice(index, 0, entry);
    }
    const now = this.time();
    let keep = entries.length;
    while (keep > 0 && entries[keep - 1].end < now - HISTORY) keep--;
    keep = Math.min(keep, MAX_ENTRIES);
    if (keep < entries.length) entries.splice(keep);
    this.state.now = this.state.paused ? this.state.now : now;
  }
}
