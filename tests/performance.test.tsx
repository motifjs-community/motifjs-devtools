import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel, type Counters } from '../src/panel/model/DevtoolsModel';
import { HISTORY, PerformanceModel, type TimelineEntry } from '../src/panel/model/PerformanceModel';
import { StoresModel } from '../src/panel/model/StoresModel';
import { PerformancePage } from '../src/panel/pages/PerformancePage';
import { axisTicks, describeEntry, formatBytes, formatDuration, laneBars, lineChart, rangeStyle } from '../src/panel/timeline';
import { tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

const counters = (notInTree = 2): Counters => ({
  components: { live: 40 + notInTree, inTree: 40, notInTree, byType: {} },
  bindings: 0,
  listeners: { dom: 0, component: 0 },
  effects: { live: 12, owned: 10 },
  reactivity: { runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 },
});

function fakeClient(memory: unknown = { used: 12 * 1024 * 1024, total: 20 * 1024 * 1024, limit: 4096 * 1024 * 1024 }) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const calls: string[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string) {
      calls.push(method);
      if (method === 'getMemory') return memory as T;
      if (method === 'getCounters') return counters() as T;
      if (method === 'getStores') return [{ id: 1, released: true, holders: [] }, { id: 2, holders: [] }] as T;
      return [] as T;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus: () => () => {},
    onDock: () => () => {},
    setDock() {},
    dispose() {},
  };
  return { client, calls, emit: (event: ClientEvent) => listeners.forEach((l) => l(event)) };
}

const built = (time: number, duration: number, type = 'Row'): ClientEvent => ({ type: 'component:built', time, payload: { path: [0], type, tag: 'div', duration } });
const disposed = (time: number, duration: number, type = 'Row'): ClientEvent => ({ type: 'component:disposed', time, payload: { path: [0], type, tag: 'div', duration } });
const flushed = (time: number, duration: number, runs = 3): ClientEvent => ({
  type: 'reactivity:flush',
  time,
  payload: { duration, runs, effects: [{}, {}], triggers: [{ target: { kind: 'object', type: 'Cart', keys: 1 }, key: 'total', count: 1 }] },
});
const navigated = (time: number, duration: number, uri = '/a', outcome = 'done'): ClientEvent => ({
  type: 'route:navigation-end',
  time,
  payload: { uri, requested: uri, outcome, duration },
});

let model: PerformanceModel | null = null;
let app: Application | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

function create(options: { now?: () => number; counters?: () => Counters | null; memory?: unknown } = {}) {
  const fake = fakeClient(options.memory);
  model = new PerformanceModel(fake.client, options.counters ?? (() => counters()), options.now ?? (() => 100_000), 0);
  return { ...fake, model };
}

describe('PerformanceModel', () => {
  it('turns the builds of one turn into one entry timed by the page', () => {
    const { model, emit } = create();
    emit(built(10_001, 0.5, 'Cell'));
    emit(built(10_002, 0.5, 'Cell'));
    emit(built(10_003, 1, 'Row'));
    emit(built(10_004, 4, 'Grid'));
    expect(model.state.entries).toEqual([]);
    model.commit(true);
    expect(model.state.entries).toHaveLength(1);
    const entry = model.state.entries[0];
    expect(entry).toMatchObject({ kind: 'build', start: 10_000, end: 10_004, duration: 4, count: 4 });
    expect(entry.types).toEqual([
      { type: 'Grid', count: 1, total: 4, max: 4 },
      { type: 'Row', count: 1, total: 1, max: 1 },
      { type: 'Cell', count: 2, total: 1, max: 0.5 },
    ]);
    expect(describeEntry(entry)).toBe('4 components · Cell ×2');
  });

  it('names plain elements by their tag', () => {
    const { model, emit } = create();
    emit({ type: 'component:built', time: 1_000, payload: { path: [0], type: 'Component', tag: 'li', duration: 0.2 } });
    emit({ type: 'component:built', time: 1_001, payload: { path: [0], type: 'Component', tag: 'li', duration: 0.2 } });
    model.commit(true);
    expect(describeEntry(model.state.entries[0])).toBe('2 components · <li> ×2');
    emit({ type: 'component:built', time: 5_000, payload: { path: [0], type: 'Component', tag: '#text', duration: 0 } });
    model.commit(true);
    expect(describeEntry(model.state.entries[0])).toBe('#text');
  });

  it('draws charts from the first sample, between one and five minutes', async () => {
    let now = 0;
    const { model } = create({ now: () => now });
    expect(model.chartSpan).toBe(60_000);
    await model.sample();
    model.state.now = 150_000;
    expect(model.chartSpan).toBe(150_000);
    model.state.now = 900_000;
    expect(model.chartSpan).toBe(HISTORY);
  });

  it('keeps builds of separate turns apart and merges a parent that covers two groups', () => {
    const { model, emit } = create();
    emit(built(10_000, 1));
    emit(built(10_100, 1));
    model.commit(true);
    expect(model.state.entries.map((e) => e.start)).toEqual([10_099, 9_999]);

    emit(built(20_000, 1));
    emit(built(20_050, 1));
    emit(built(20_051, 60, 'Page'));
    model.commit(true);
    expect(model.state.entries[0]).toMatchObject({ kind: 'build', start: 19_991, end: 20_051, count: 3 });
  });

  it('records disposals, flushes and navigations newest first', () => {
    const { model, emit } = create();
    emit(navigated(5_000, 40, '/orders'));
    emit(flushed(5_100, 2, 7));
    emit(disposed(5_200, 3));
    model.commit(true);
    expect(model.state.entries.map((e) => e.kind)).toEqual(['dispose', 'flush', 'navigation']);
    expect(model.state.entries[1]).toMatchObject({ count: 7, effects: 2, duration: 2 });
    expect(model.state.entries[2]).toMatchObject({ uri: '/orders', outcome: 'done', start: 4_960 });
    expect(model.state.entries[2].requested).toBeUndefined();
  });

  it('commits a quiet group on its own and leaves a busy one open', async () => {
    let now = 1_000;
    const { model, emit } = create({ now: () => now });
    emit(built(1_000, 1));
    model.commit();
    expect(model.state.entries).toHaveLength(0);
    now = 1_100;
    model.commit();
    expect(model.state.entries).toHaveLength(1);
  });

  it('samples heap and component counts and keeps five minutes', async () => {
    let now = 0;
    const { model } = create({ now: () => now });
    await model.sample();
    expect(model.state.memory).toBe(true);
    expect(model.latest).toMatchObject({ used: 12 * 1024 * 1024, live: 42, inTree: 40, notInTree: 2 });
    now = HISTORY + 1;
    await model.sample();
    expect(model.state.samples).toHaveLength(1);
  });

  it('says so when the browser does not report the heap', async () => {
    const { model } = create({ memory: null });
    await model.sample();
    expect(model.state.memory).toBe(false);
    expect(model.latest).toMatchObject({ used: null, notInTree: 2 });
  });

  it('ignores events and samples while paused', async () => {
    const { model, emit } = create();
    model.togglePause();
    emit(flushed(1_000, 1));
    await model.sample();
    model.commit(true);
    expect(model.state.entries).toHaveLength(0);
    expect(model.state.samples).toHaveLength(0);
  });

  it('warns when components outside the tree rise after each of the last navigations', async () => {
    let now = 0;
    let outside = 0;
    const { model, emit } = create({ now: () => now, counters: () => counters(outside) });
    for (const value of [3, 5, 8, 12]) {
      emit(navigated(now + 100, 10));
      model.commit(true);
      now += 2_000;
      outside = value;
      await model.sample();
    }
    expect(model.rising).toBe(true);
    emit(navigated(now + 100, 10));
    model.commit(true);
    now += 2_000;
    outside = 12;
    await model.sample();
    expect(model.rising).toBe(false);
  });

  it('narrows the list and the slowest tables to the selected range', () => {
    const { model, emit } = create();
    emit(built(1_000, 5, 'Slow'));
    model.commit(true);
    emit(built(3_000, 1, 'Fast'));
    emit(flushed(3_010, 9));
    model.commit(true);
    expect(model.slowestTypes.map((s) => s.type)).toEqual(['Slow', 'Fast']);
    model.select(2_900, 3_100);
    expect(model.listed.map((e) => e.kind)).toEqual(['flush', 'build']);
    expect(model.slowestTypes.map((s) => s.type)).toEqual(['Fast']);
    expect(model.longestFlushes).toHaveLength(1);

    model.setKind('flush');
    const slow = model.state.entries.find((e) => e.types?.[0]?.type === 'Slow')!;
    model.focus(slow.id);
    expect(model.state.kind).toBe('all');
    expect(model.state.selection).toBeNull();
    expect(model.state.expanded).toBe(slow.id);
  });

  it('clears the recording', async () => {
    const { model, emit } = create();
    emit(flushed(1_000, 1));
    model.commit(true);
    await model.sample();
    model.clear();
    expect(model.state.entries).toHaveLength(0);
    expect(model.state.samples).toHaveLength(0);
  });
});

describe('timeline drawing', () => {
  const entry = (patch: Partial<TimelineEntry>): TimelineEntry => ({ id: 1, kind: 'navigation', start: 0, end: 0, duration: 0, count: 1, ...patch });

  it('places bars inside the window and escapes their title', () => {
    const html = laneBars([entry({ id: 7, start: 40_000, end: 45_000, duration: 5_000, uri: '/a?x="<b>"' })], 'navigation', 60_000, 60_000, 7);
    expect(html).toContain('data-id="7"');
    expect(html).toContain('left:66.667%;width:8.333%');
    expect(html).toContain('class="dt-tl-bar navigation open"');
    expect(html).toContain('/a?x=&quot;&lt;b&gt;&quot;');
    expect(laneBars([entry({ start: 0, end: 1 })], 'navigation', 60_000, 10_000, null)).toBe('');
  });

  it('labels the axis for each window', () => {
    expect(axisTicks(60_000).map((t) => t.label)).toEqual(['−60 s', '−50 s', '−40 s', '−30 s', '−20 s', '−10 s', 'now']);
    expect(axisTicks(300_000).map((t) => t.label)).toEqual(['−5 min', '−4 min', '−3 min', '−2 min', '−1 min', 'now']);
  });

  it('formats sizes, ranges and charts', () => {
    expect(formatDuration(4.5)).toBe('4.50 ms');
    expect(formatDuration(2_500)).toBe('2.50 s');
    expect(formatBytes(null)).toBe('–');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
    expect(rangeStyle(null, 0, 1)).toBe('display: none');
    expect(rangeStyle({ from: 50, to: 75 }, 100, 100)).toBe('left: 50.000%; width: 25.000%');
    const svg = lineChart([{ at: 0, value: 1 }, { at: 50, value: 2 }], 100, 100, 'heap', [50]);
    expect(svg).toContain('<polyline class="line"');
    expect(svg).toContain('<line class="marker" x1="300.0"');
  });
});

describe('PerformancePage', () => {
  async function render(memory?: unknown) {
    const fake = fakeClient(memory);
    const devtools = new DevtoolsModel(fake.client);
    devtools.state.status = { connected: true, version: 1 };
    devtools.state.counters = counters(3);
    model = new PerformanceModel(fake.client, () => devtools.state.counters, () => 100_000, 0);
    const stores = new StoresModel(fake.client, () => true);
    await stores.load();
    document.body.innerHTML = '<div id="app"></div>';
    const builder = Application.CreateBuilder();
    builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
    builder.services.addSingleton(PerformanceModel, { useValue: model });
    builder.services.addSingleton(StoresModel, { useValue: stores });
    app = builder.build();
    app.run('#app', new PerformancePage());
    await settle();
    return { ...fake, model };
  }

  const cards = () => [...document.querySelectorAll('.dt-card')].map((c) => [...c.children].map((e) => e.textContent!.trim()));
  const rows = () => [...document.querySelectorAll('.dt-perf-entry .dt-perf-row')].map((r) => [...r.children].map((e) => e.textContent!.trim()).filter(Boolean));

  it('shows heap, components and released stores', async () => {
    const { model } = await render();
    await model.sample();
    await settle();
    expect(cards()).toEqual([
      ['JS HEAP', '12.0 MB', 'of 4096.0 MB limit'],
      ['COMPONENTS', '43', '40 in the tree'],
      ['NOT IN THE TREE', '3', 'Kept by keepAlive pages or not attached yet'],
      ['RELEASED STORES', '1', 'Waiting for garbage collection'],
    ]);
    expect(document.querySelector('.dt-perf-plot svg polyline')).not.toBeNull();
  });

  it('explains when the browser has no heap size', async () => {
    const { model } = await render(null);
    await model.sample();
    await settle();
    expect(cards()[0]).toEqual(['JS HEAP', '–', 'Chromium browsers only']);
    expect(document.querySelector('.dt-perf-chart .dt-empty')!.textContent).toContain('does not report heap size');
  });

  it('draws lanes, lists events and opens a build', async () => {
    const { model, emit } = await render();
    emit(navigated(99_000, 30, '/orders'));
    emit(built(99_010, 2, 'Row'));
    emit(built(99_012, 6, 'Table'));
    emit(flushed(99_500, 1.5));
    model.commit(true);
    await settle();
    expect(document.querySelectorAll('.dt-tl-lane .dt-tl-bar')).toHaveLength(3);
    expect([...document.querySelectorAll('.dt-tl-label')].map((l) => l.textContent)).toEqual(['Navigation', 'Reactivity', 'Build', 'Dispose']);
    expect([...document.querySelectorAll('.dt-perf-section select option')].map((o) => o.textContent)).toEqual(['All kinds', 'Navigation', 'Reactivity', 'Build', 'Dispose']);
    expect(rows()).toEqual([
      [expect.any(String), 'Reactivity', '3 runs, 2 effects', '1.50 ms'],
      [expect.any(String), 'Build', '2 components · Table ×1', '6.00 ms'],
      [expect.any(String), 'Navigation', '/orders', '30.0 ms'],
    ]);
    (document.querySelectorAll('.dt-perf-entry .dt-perf-row')[1] as HTMLElement).click();
    await settle();
    const detail = [...document.querySelectorAll('.dt-perf-entry.open .dt-perf-trow:not(.dt-table-head)')].map((r) => r.textContent);
    expect(detail).toEqual(['Table16.00 ms6.00 ms', 'Row12.00 ms2.00 ms']);
    expect([...document.querySelectorAll('.dt-perf-slowest .dt-perf-top')].map((b) => b.children[1].textContent)).toEqual(['3 runs, 2 effects', '/orders']);
  });

  const stubTracks = () => {
    const tracks = document.querySelector('.dt-tl-tracks') as HTMLElement;
    tracks.getBoundingClientRect = () => ({ left: 0, width: 600, top: 0, height: 100, right: 600, bottom: 100, x: 0, y: 0, toJSON() {} });
    return tracks;
  };

  it('filters by kind and opens an entry from a bar', async () => {
    const { model, emit } = await render();
    stubTracks();
    emit(navigated(99_000, 30, '/orders'));
    emit(flushed(99_500, 1.5));
    model.commit(true);
    await settle();
    const select = document.querySelector('.dt-perf-section select') as HTMLSelectElement;
    select.value = 'navigation';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(rows().map((r) => r[1])).toEqual(['Navigation']);

    const bar = document.querySelector('.dt-tl-bar.flush') as HTMLElement;
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 10 }));
    await settle();
    expect(model.state.kind).toBe('all');
    expect(document.querySelector('.dt-perf-entry.open .dt-kind')!.textContent).toBe('Reactivity');
  });

  it('selects a range by dragging across the lanes', async () => {
    const { model } = await render();
    const tracks = stubTracks();
    tracks.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 450 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 450 }));
    await settle();
    expect(model.state.selection).toEqual({ from: 70_000, to: 85_000 });
    const range = document.querySelector('.dt-tl-range') as HTMLElement;
    expect([range.style.left, range.style.width]).toEqual(['50%', '25%']);
    expect(document.querySelector('.dt-tl-selection b')!.textContent).toContain('(15.00 s)');
    (document.querySelector('.dt-tl-selection button') as HTMLElement).click();
    await settle();
    expect(model.state.selection).toBeNull();
  });
});
