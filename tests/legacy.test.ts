import { afterEach, describe, expect, it } from 'vitest';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { adaptLegacy } from '../src/bridge/legacy';
import { CHANNEL, type BridgeChunk, type BridgeMessage, type BridgeResponse, type TreeRecord } from '../src/bridge/protocol';
import { drain, eventsIn, microScheduler } from './helpers';

type Node = { path: number[]; type: string; tag: string; built: boolean; visible: boolean; waiting: boolean; disposed: boolean; connected: boolean; childCount: number; children?: Node[] };

const node = (path: number[], type: string, tag: string, children: Node[] = []): Node => ({ path, type, tag, built: true, visible: true, waiting: false, disposed: false, connected: true, childCount: children.length, children });
const shell = node([], 'Component', 'div', [node([0], 'Root', 'main', [node([0, 0], 'Card', 'article')])]);
const find = (n: Node | null, path: number[]): Node | null => path.reduce<Node | null>((cur, i) => cur?.children?.[i] ?? null, n);
const trim = (n: Node, depth: number): Node => {
  const out: Node = { ...n };
  if (depth > 0) out.children = (n.children ?? []).map((c) => trim(c, depth - 1));
  else delete out.children;
  return out;
};

function fakeV1() {
  const listeners = new Set<(event: { type: string; payload?: unknown }) => void>();
  const el = document.createElement('article');
  document.body.appendChild(el);
  const inspection = (n: Node) => ({ ...trim(n, 0), props: { other: { kind: 'component', path: [0, 0], type: 'Card' } }, fields: {}, bindings: [], events: [], hooks: [], classes: { static: [], reactive: [] }, attributes: [], services: null, effects: [], extensions: {} });
  const contract = {
    version: 1,
    coreVersion: '1.2.0-rc.22',
    on(listener: (event: { type: string; payload?: unknown }) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isEnabled: () => true,
    getTree: (path: number[] = [], depth = Infinity) => {
      const n = find(shell, path);
      return n === null ? null : trim(n, depth);
    },
    getElement: (path: number[]) => (JSON.stringify(path) === '[0,0]' ? el : null),
    pathOfElement: (n: Node | null) => ((n as unknown) === el ? [0, 0] : null),
    inspect: (path: number[]) => {
      const n = find(shell, path);
      return n === null ? null : inspection(n);
    },
    getStores: () => [{ id: 1, name: 'cart', type: 'reactive', value: { n: 1 }, holders: [{ kind: 'component', path: [0], type: 'Root', field: 'cart' }] }],
    readValue: (path: number[]) => (find(shell, path) ? { ok: true, value: { value: { kind: 'component', path: [0, 0], type: 'Card' }, entries: [], total: 0 } } : { ok: false, error: 'no component at path' }),
    setClass: (path: number[]) => ({ ok: find(shell, path) !== null }),
    getCounters: () => ({ components: { live: 3, inTree: 3, notInTree: 0, byType: {} }, bindings: 0, listeners: { dom: 0, component: 0 }, effects: { live: 0, owned: 0 }, reactivity: { runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 } }),
    emit(type: string, payload: unknown) {
      for (const l of listeners) l({ type, payload });
    },
  };
  return { contract, el };
}

let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)! as BridgeResponse & { value: unknown };
};

const start = (contract: unknown) => {
  (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__ = contract;
  messages = [];
  bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
};

afterEach(() => {
  bridge?.dispose();
  bridge = null;
  delete (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__;
  document.body.innerHTML = '';
  document.querySelector('motif-devtools-overlay')?.remove();
});

describe('a contract 1 core behind the bridge', () => {
  it('connects and reports the core version it found', () => {
    start(fakeV1().contract);
    expect(messages.at(-1)).toMatchObject({ kind: 'status', connected: true, version: 1, coreVersion: '1.2.0-rc.22' });
  });

  it('puts the shell under a root list and shifts every path by one level', async () => {
    start(fakeV1().contract);
    const tree = (await call('getTree')) as { value: Node };
    expect(tree.value).toMatchObject({ path: [], type: 'Application', tag: '#roots', childCount: 1 });
    expect(tree.value.children![0]).toMatchObject({ path: [0], type: 'Component', tag: 'div' });
    expect(tree.value.children![0].children![0]).toMatchObject({ path: [0, 0], type: 'Root' });
    expect(tree.value.children![0].children![0].children![0]).toMatchObject({ path: [0, 0, 0], type: 'Card' });
    expect((await call('getTree', [0, 0, 0])).value as object).toMatchObject({ path: [0, 0, 0], type: 'Card' });
    expect((await call('getTree', [1])).value).toBeNull();
    expect((await call('inspect', [])).value).toBeNull();
    const card = (await call('inspect', [0, 0, 0])) as { value: { path: number[]; props: { other: { path: number[] } } } };
    expect(card.value.path).toEqual([0, 0, 0]);
    expect(card.value.props.other.path).toEqual([0, 0, 0]);
  });

  it('streams the tree with the root list first', async () => {
    start(fakeV1().contract);
    const id = nextId++;
    await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method: 'readTree', args: [] });
    await drain();
    const records = messages.filter((m): m is BridgeChunk => m.kind === 'chunk' && m.id === id).flatMap((m) => m.value as TreeRecord[]);
    expect(records.map((r) => [r[0], r[2]])).toEqual([[0, 'Application'], [1, 'Component'], [2, 'Root'], [3, 'Card']]);
  });

  it('shifts store holders, opened values and write paths', async () => {
    start(fakeV1().contract);
    const stores = (await call('getStores')) as { value: { holders: { path: number[] }[]; value: unknown }[] };
    expect(stores.value[0].holders[0].path).toEqual([0, 0]);
    expect(stores.value[0].value).toEqual({ n: 1 });
    const read = (await call('readValue', [0, 0, 0], 'props', ['other'])) as { value: { ok: boolean; value: { value: { path: number[] } } } };
    expect(read.value.value.value.path).toEqual([0, 0, 0]);
    expect((await call('readValue', [5], 'props', [])).value).toEqual({ ok: false, error: 'no component at path' });
    expect((await call('setClass', [0, 0], 'x', true)).value).toEqual({ ok: true });
    expect((await call('setClass', [2, 0], 'x', true)).value).toEqual({ ok: false, error: 'no component at path' });
  });

  it('highlights and picks through the shifted paths', async () => {
    const { contract, el } = fakeV1();
    start(contract);
    expect(await call('highlight', [0, 0, 0])).toMatchObject({ ok: true, value: true });
    const label = document.querySelector('motif-devtools-overlay')!.shadowRoot!.querySelector('.label') as HTMLElement;
    expect(label.textContent).toContain('Card');
    await call('pick', true);
    el.click();
    await drain();
    expect(eventsIn(messages).filter((e) => e.type === 'devtools:picked').map((e) => e.payload)).toEqual([{ path: [0, 0, 0] }]);
  });

  it('shifts the paths inside events', async () => {
    const { contract } = fakeV1();
    start(contract);
    contract.emit('tree:changed', { parents: [[], [0]] });
    contract.emit('component:built', { path: [0, 0], type: 'Card', tag: 'article', duration: 1 });
    contract.emit('component:disposed', { path: null, type: 'Loose', tag: 'p' });
    contract.emit('reactivity:flush', { duration: 1, runs: 1, triggers: [], effects: [{ path: [0], type: 'Root', tag: 'main', kind: 'binding', runs: 1 }, { path: null, type: null, tag: null, kind: 'effect', runs: 1 }] });
    await drain();
    const events = eventsIn(messages);
    expect(events.find((e) => e.type === 'tree:changed')?.payload).toEqual({ parents: [[0], [0, 0]] });
    expect(events.find((e) => e.type === 'component:built')?.payload).toMatchObject({ path: [0, 0, 0] });
    expect(events.find((e) => e.type === 'component:disposed')?.payload).toMatchObject({ path: null });
    expect((events.find((e) => e.type === 'reactivity:flush')?.payload as { effects: { path: unknown }[] }).effects.map((e) => e.path)).toEqual([[0, 0], null]);
  });

  it('answers the page document when the core has no document list', () => {
    const adapted = adaptLegacy(fakeV1().contract as never);
    expect((adapted.getDocuments as () => Document[])()).toEqual([document]);
    expect(adapted.version).toBe(1);
    expect(adapted.coreVersion).toBe('1.2.0-rc.22');
  });
});
