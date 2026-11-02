import { describe, expect, it } from 'vitest';
import type { Client, ClientEvent } from '../src/client/client';
import { laneMarkup } from '../src/panel/lanes';
import { LanesModel, MAX_LANE_ENTRIES, type LaneDef } from '../src/panel/model/LanesModel';
import { idleClient } from './helpers';

function eventClient() {
  const listeners = new Set<(event: ClientEvent) => void>();
  const client = {
    status: { connected: true, version: 2 },
    dock: null,
    request: async () => null,
    onEvent(listener: (event: ClientEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus: () => () => {},
    onDock: () => () => {},
    ...idleClient,
    setDock() {},
    dispose() {},
  } as unknown as Client;
  return { client, emit: (event: ClientEvent) => listeners.forEach((listener) => listener(event)) };
}

const LANES: LaneDef[] = [
  { key: 'orders/actions', name: 'orders', label: 'Actions', tone: 'success', event: 'ext:orders:action', itemDuration: 'took', itemTitle: 'name' },
  { key: 'orders/changes', name: 'orders', label: 'Changes', event: 'ext:orders:changed' },
];

describe('lanes of the packages', () => {
  it('turns the events a lane names into items of that lane, with the duration and title of the payload', () => {
    const { client, emit } = eventClient();
    const model = new LanesModel(client, () => LANES);
    emit({ type: 'ext:orders:action', payload: { name: 'cart/add', took: 40 }, time: 10_000 });
    emit({ type: 'ext:orders:changed', payload: { count: 3 }, time: 10_050 });
    emit({ type: 'ext:orders:ignored', payload: {}, time: 10_060 });
    emit({ type: 'reactivity:flush', payload: {}, time: 10_070 });
    expect(model.state.entries).toEqual([
      { key: '1', id: 1, lane: 'orders/actions', start: 9_960, end: 10_000, title: 'cart/add', status: '', tone: 'success' },
      { key: '2', id: 2, lane: 'orders/changes', start: 10_050, end: 10_050, title: 'changed', status: '', tone: undefined },
    ]);
    model.clear();
    expect(model.state.entries).toEqual([]);
    model.dispose();
  });

  it('keeps the newest items up to its limit', () => {
    const { client, emit } = eventClient();
    const model = new LanesModel(client, () => LANES);
    for (let i = 0; i < MAX_LANE_ENTRIES + 5; i++) emit({ type: 'ext:orders:changed', payload: {}, time: i });
    expect(model.state.entries).toHaveLength(MAX_LANE_ENTRIES);
    expect(model.state.entries[0].start).toBe(5);
    model.dispose();
  });

  it('draws the items of a lane inside the window as bars or dots, the chosen one open', () => {
    const items = [
      { key: 'a', id: 'a', lane: 'x', start: 900, end: 950, title: 'long', status: 'done', tone: undefined },
      { key: 'b', id: 'b', lane: 'x', start: 990, end: 990, title: 'tick', status: '', tone: 'warning' as const },
      { key: 'c', id: 'c', lane: 'y', start: 900, end: 950, title: 'other lane', status: '', tone: undefined },
      { key: 'd', id: 'd', lane: 'x', start: 100, end: 200, title: 'too old', status: '', tone: undefined },
    ];
    const html = laneMarkup(items, 'x', 1000, 100, 'b');
    expect(html).toContain('data-key="a"');
    expect(html).toContain('title="long · done · 50.0 ms"');
    expect(html).toContain('class="dt-tl-bar dot tone-warning open" data-key="b"');
    expect(html).not.toContain('data-key="c"');
    expect(html).not.toContain('data-key="d"');
    expect(html).toMatch(/left:0\.000%;width:50\.000%/);
  });
});
