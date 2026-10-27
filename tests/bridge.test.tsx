import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Component, createSignal, reactive } from '@motifx/core';
import { nameModuleStore } from '@motifx/core/devtools';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { CHANNEL, type BridgeMessage, type BridgeResponse } from '../src/bridge/protocol';
import { drain, eventsIn, microScheduler, tick } from './helpers';

class Counter extends Component<HTMLDivElement> {
  state = reactive({ count: 0 });
  override view() {
    return <span>{this.state.count}</span>;
  }
}

class Basket {
  items = ['tea', 'cake'];
}

class Theme {
  mode = createSignal({ name: 'dark', contrast: 1 });
}

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;

const start = () => {
  bridge = createBridge({ send: (message) => messages.push(message), interval: 10, scheduler: microScheduler });
  return bridge;
};

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)!;
};

const runApp = () => {
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(Basket, Basket);
  builder.services.addSingleton(Theme, Theme);
  app = builder.build();
  app.useDevelopment(true);
  const root = new Counter();
  app.run('#app', root);
  return root;
};

beforeEach(() => {
  messages = [];
});

afterEach(async () => {
  bridge?.dispose();
  bridge = null;
  if (app) {
    app.useDevelopment(false);
    await app.dispose?.();
  }
  app = null;
  delete (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__;
  vi.useRealTimers();
});

describe('bridge', () => {
  it('reports missing, then connected once useDevelopment(true) runs', async () => {
    vi.useFakeTimers();
    start();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: CHANNEL, kind: 'status', connected: false, version: null, reason: 'missing' });
    runApp();
    vi.advanceTimersByTime(20);
    expect(messages.at(-1)).toMatchObject({ channel: CHANNEL, kind: 'status', connected: true, version: 2 });
    expect((messages.at(-1) as { coreVersion?: string }).coreVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(messages.filter((m) => m.kind === 'status')).toHaveLength(2);
  });

  it('refuses an unknown contract version', () => {
    (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__ = { version: 3, on: () => () => {} };
    start();
    expect(messages.at(-1)).toMatchObject({ channel: CHANNEL, kind: 'status', connected: false, version: 3, reason: 'unsupported-version' });
    expect(bridge!.connected).toBe(false);
  });

  it('answers not-connected before the app enables devtools', async () => {
    start();
    expect(await call('getTree')).toMatchObject({ ok: false, error: 'not-connected' });
  });

  it('returns JSON-safe results for reads', async () => {
    runApp();
    start();
    for (const method of ['getTree', 'getCounters', 'getWarnings', 'getErrors', 'getStores', 'getServices', 'getScopes', 'getNavigations', 'getExtensions']) {
      const response = await call(method);
      expect(response.ok, method).toBe(true);
      const value = (response as { value: unknown }).value;
      expect(JSON.parse(JSON.stringify(value)), method).toEqual(value);
    }
    const tree = (await call('getTree')) as { value: { type: string; path: number[] } };
    expect(tree.value).toMatchObject({ path: [] });
    const inspected = await call('inspect', []);
    expect(inspected.ok).toBe(true);
  });

  it('keeps the holder path of a store whole and sends its value shallow', async () => {
    runApp();
    start();
    const response = (await call('getStores')) as { value: { holders: { field: string }[]; value: unknown }[] };
    const store = response.value.find((s) => s.holders.some((h) => h.field === 'state'))!;
    expect(store.holders).toEqual([{ kind: 'component', path: [0, 0], type: 'Counter', field: 'state' }]);
    expect(store.value).toEqual({ count: 0 });
    expect('released' in store).toBe(false);
  });

  it('sends every child of a component however many there are', async () => {
    class LongList extends Component<HTMLUListElement> {
      static override elementTag = 'ul';
      rows = reactive({ list: Array.from({ length: 150 }, (_, i) => i) });
      override view() {
        return (
          <>
            {this.rows.list.map((n) => (
              <li key={n}>{String(n)}</li>
            ))}
          </>
        );
      }
    }
    document.body.innerHTML = '<div id="app"></div>';
    app = Application.CreateBuilder().build();
    app.useDevelopment(true);
    app.run('#app', new LongList());
    start();
    type Node = { path: number[]; childCount: number; children?: Node[] };
    const tree = ((await call('getTree')) as { value: Node }).value;
    const nodes: Node[] = [];
    const walk = (node: Node) => {
      nodes.push(node);
      node.children?.forEach(walk);
    };
    walk(tree);
    const items = nodes.find((n) => n.childCount === 150)!;
    expect(items.children).toHaveLength(150);
    expect(nodes.every((n) => Array.isArray(n.path))).toBe(true);
  });

  it('sends the whole route tree however deep it is', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = Application.CreateBuilder().build();
    app.useDevelopment(true);
    const leaf = () => new Component('section');
    app.useRouter({
      mode: 'hash',
      routes: [{ path: '/', control: leaf, childs: [{ path: 'a', control: leaf, childs: [{ path: 'b', control: leaf, childs: [{ path: 'c', control: leaf, meta: { deep: { level: 4 } } }] }] }] }],
    });
    app.run('#app');
    start();
    const response = (await call('getRoutes')) as { value: { childs: { childs: { childs: { path: string; control: unknown; meta: unknown }[] }[] }[] }[] };
    const c = response.value[0].childs[0].childs[0].childs[0];
    expect(c.path).toBe('c');
    expect(c.control).toEqual({ $motif: 'function', name: 'leaf' });
    expect(c.meta).toEqual({ deep: { level: 4 } });
  });

  it('passes the name and file of a module store', async () => {
    const cart = reactive({ items: [] as string[] });
    nameModuleStore(cart, 'cart', 'src/stores/cart.ts');
    runApp();
    start();
    const response = (await call('getStores')) as { value: { name: string; file?: string; holders: { field: string }[] }[] };
    expect(response.value.find((s) => s.name === 'cart')).toMatchObject({ name: 'cart', file: 'src/stores/cart.ts', holders: [] });
    expect(response.value.find((s) => s.holders.some((h) => h.field === 'state'))).not.toHaveProperty('file');
  });

  it('keeps the preview of every entry when a value is opened', async () => {
    runApp();
    start();
    const tree = (await call('readValue', [0, 0], 'fields', [])) as { value: { ok: boolean; value: { entries: { key: string; value: unknown }[] } } };
    expect(tree.value.value.entries.find((e) => e.key === 'state')?.value).toEqual({ kind: 'object', type: 'Object', keys: 1 });
  });

  it('sends scopes whole and reads a service', async () => {
    runApp();
    start();
    app!.provider.get(Basket);
    const scopes = (await call('getScopes')) as { value: { id: number; kind: string; services: { token: string; instance: unknown }[] }[] };
    const root = scopes.value.find((s) => s.kind === 'root')!;
    expect(root.services.find((s) => s.token === 'Basket')?.instance).toEqual({ kind: 'object', type: 'Basket', keys: 1 });
    const read = (await call('readService', root.id, 'Basket', [])) as { value: { ok: boolean; value: { entries: unknown[] } } };
    expect(read.value.value.entries).toEqual([{ key: 'items', value: { kind: 'array', length: 2 } }]);
  });

  it('shows a signal in a service by its value and opens through it', async () => {
    runApp();
    start();
    app!.provider.get(Theme);
    const scopes = (await call('getScopes')) as { value: { id: number; kind: string }[] };
    const root = scopes.value.find((s) => s.kind === 'root')!.id;
    const fields = (await call('readService', root, 'Theme', [])) as { value: { value: { entries: unknown[] } } };
    expect(fields.value.value.entries).toEqual([{ key: 'mode', value: { kind: 'signal', type: 'signal', value: { kind: 'object', type: 'Object', keys: 2 } } }]);
    const mode = (await call('readService', root, 'Theme', ['mode'])) as { value: { value: { entries: unknown[] } } };
    expect(mode.value.value.entries).toEqual([{ key: 'name', value: 'dark' }, { key: 'contrast', value: 1 }]);
  });

  it('rejects methods outside the allow list', async () => {
    runApp();
    start();
    expect(await call('getElement', [])).toMatchObject({ ok: false, error: 'unknown-method' });
    expect(await call('constructor')).toMatchObject({ ok: false, error: 'unknown-method' });
  });

  it('forwards contract events as JSON-safe messages', async () => {
    const root = runApp();
    start();
    root.state.count++;
    await drain();
    const flush = eventsIn(messages).find((e) => e.type === 'reactivity:flush');
    expect(flush).toBeDefined();
    expect(JSON.parse(JSON.stringify(flush))).toEqual(flush);
  });

  it('holds events until after the next frame with the default scheduler', async () => {
    const root = runApp();
    bridge = createBridge({ send: (message) => messages.push(message), interval: 10 });
    root.state.count++;
    await tick();
    await tick();
    expect(eventsIn(messages)).toEqual([]);
    expect(messages.filter((m) => m.kind === 'status')).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(eventsIn(messages).some((e) => e.type === 'reactivity:flush')).toBe(true);
  });

  it('stamps every event with the page time', async () => {
    const root = runApp();
    start();
    const before = performance.timeOrigin + performance.now();
    root.state.count++;
    await tick();
    await tick();
    const after = performance.timeOrigin + performance.now();
    await drain();
    const events = eventsIn(messages);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.time).toBeGreaterThanOrEqual(before);
      expect(event.time).toBeLessThanOrEqual(after);
    }
  });

  it('reads the heap size of the page when the browser reports it', async () => {
    start();
    expect(await call('getMemory')).toMatchObject({ ok: true, value: null });
    Object.defineProperty(performance, 'memory', { configurable: true, value: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 40 } });
    try {
      expect(await call('getMemory')).toMatchObject({ ok: true, value: { used: 10, total: 20, limit: 40 } });
    } finally {
      delete (performance as { memory?: unknown }).memory;
    }
  });

  it('passes write results back', async () => {
    runApp();
    start();
    expect(await call('setClass', [0, 0], 'picked', true)).toMatchObject({ ok: true });
  });

  it('stops listening after dispose and after devtools is turned off', async () => {
    const root = runApp();
    start();
    app!.useDevelopment(false);
    bridge!.check();
    expect(messages.at(-1)).toMatchObject({ kind: 'status', connected: false, reason: 'missing' });
    const before = messages.length;
    root.state.count++;
    await tick();
    expect(messages.length).toBe(before);
  });
});

describe('bridge.receive', () => {
  it('answers hello with the current status again and routes requests', async () => {
    runApp();
    start();
    const statuses = () => messages.filter((m) => m.kind === 'status').length;
    expect(statuses()).toBe(1);
    bridge!.receive({ channel: CHANNEL, kind: 'hello' });
    expect(statuses()).toBe(2);
    expect(messages.at(-1)).toMatchObject({ kind: 'status', connected: true, host: location.host });
    bridge!.receive({ channel: CHANNEL, kind: 'request', id: 99, method: 'getCounters', args: [] });
    await tick();
    expect(messages.at(-1)).toMatchObject({ kind: 'response', id: 99, ok: true });
    bridge!.receive({ channel: 'other', kind: 'hello' });
    expect(statuses()).toBe(2);
  });
});
