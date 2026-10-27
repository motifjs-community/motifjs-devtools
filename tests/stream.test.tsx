import { afterEach, describe, expect, it } from 'vitest';
import { Application, Component, reactive } from '@motifx/core';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { plainCopy } from '../src/bridge/copy';
import { DEFERRED } from '../src/bridge/outbox';
import { CHANNEL, type BridgeMessage, type TreeRecord } from '../src/bridge/protocol';
import { toTransfer } from '../src/bridge/serialize';
import { TREE_SLICE } from '../src/bridge/tree';
import { treeBuilder, type TreeNode } from '../src/panel/model/ElementsModel';
import { drain, microScheduler, tick } from './helpers';

type Item = { id: number; label: string };

function Label(props: { item: Item }) {
  return <span class="label">{() => props.item.label}</span>;
}

class Shop extends Component<HTMLDivElement> {
  state = reactive({ items: [] as Item[], open: true });

  constructor(count: number) {
    super();
    this.state.items = Array.from({ length: count }, (_, id) => ({ id, label: `item ${id}` }));
  }

  override view() {
    return (
      <>
        <header x-display={() => this.state.open}>Shop</header>
        <ul>
          {this.state.items.map((item) => (
            <li key={item.id}>
              <Label item={item} />
            </li>
          ))}
        </ul>
      </>
    );
  }
}

type Contract = {
  on(listener: (event: { type: string; payload?: unknown }) => void): () => void;
  getTree(path?: number[], depth?: number): TreeNode | null;
};

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];

const contract = () => (globalThis as { __MOTIF_DEVTOOLS__?: Contract }).__MOTIF_DEVTOOLS__!;

const run = (count: number) => {
  document.body.innerHTML = '<div id="app"></div>';
  app = Application.CreateBuilder().build();
  app.useDevelopment(true);
  const root = new Shop(count);
  app.run('#app', root);
  return root;
};

const strip = (node: TreeNode): unknown => ({
  path: node.path,
  type: node.type,
  tag: node.tag,
  built: node.built,
  visible: node.visible,
  waiting: node.waiting,
  disposed: node.disposed,
  connected: node.connected,
  childCount: node.childCount,
  children: (node.children ?? []).map(strip),
});

afterEach(async () => {
  bridge?.dispose();
  bridge = null;
  messages = [];
  if (app) {
    app.useDevelopment(false);
    await app.dispose?.();
  }
  app = null;
  delete (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__;
});

describe('frequent events', () => {
  it('are copied the same way as every other event', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = Application.CreateBuilder().build();
    app.useDevelopment(true);
    const seen: { type: string; payload?: unknown }[] = [];
    contract().on((event) => seen.push(event));
    const root = new Shop(30);
    app.run('#app', root);
    await tick();
    root.state.open = false;
    root.state.items[3].label = 'renamed';
    root.state.items.splice(5, 4);
    await tick();
    await tick();
    const checked = seen.filter((event) => DEFERRED.has(event.type));
    expect([...new Set(checked.map((event) => event.type))]).toEqual(expect.arrayContaining(['component:built', 'component:visibility', 'component:disposing', 'component:disposed', 'tree:changed', 'reactivity:flush']));
    for (const event of checked) {
      const depth = event.type === 'reactivity:flush' ? 6 : 4;
      expect(plainCopy(event.payload, depth)).toEqual(toTransfer(event.payload, depth));
    }
  });
});

describe('readTree', () => {
  it('streams the whole tree in slices that rebuild the same tree as getTree', async () => {
    run(TREE_SLICE + 200);
    bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
    await bridge.handle({ channel: CHANNEL, kind: 'request', id: 1, method: 'readTree', args: [] });
    await drain(20);
    const chunks = messages.filter((m): m is Extract<BridgeMessage, { kind: 'chunk' }> => m.kind === 'chunk' && m.id === 1);
    const response = messages.find((m) => m.kind === 'response' && m.id === 1);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect((chunk.value as TreeRecord[]).length).toBeLessThanOrEqual(TREE_SLICE);
    const builder = treeBuilder();
    for (const chunk of chunks) builder.add(chunk.value as TreeRecord[]);
    const total = chunks.reduce((sum, chunk) => sum + (chunk.value as TreeRecord[]).length, 0);
    expect(response).toMatchObject({ ok: true, value: { count: total } });
    expect(strip(builder.root!)).toEqual(strip(contract().getTree()!));
    expect(() => structuredClone(chunks)).not.toThrow();
  });

  it('names an iframe row from its title, name or id', async () => {
    const root = run(2);
    const frames = [new Component('iframe'), new Component('iframe'), new Component('iframe'), new Component('iframe')];
    (frames[0].element as HTMLIFrameElement).title = 'Order preview';
    (frames[1].element as HTMLIFrameElement).name = 'help';
    (frames[2].element as HTMLIFrameElement).id = 'chat';
    root.controls.add(...frames);
    bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
    await bridge.handle({ channel: CHANNEL, kind: 'request', id: 2, method: 'readTree', args: [] });
    await drain(20);
    const records = messages.filter((m): m is Extract<BridgeMessage, { kind: 'chunk' }> => m.kind === 'chunk' && m.id === 2).flatMap((chunk) => chunk.value as TreeRecord[]);
    expect(records.filter((record) => record[3] === 'iframe').map((record) => record[7])).toEqual(['Order preview', 'help', 'chat', undefined]);
  });

  it('stops streaming when the panel cancels', async () => {
    run(TREE_SLICE * 3);
    bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
    void bridge.handle({ channel: CHANNEL, kind: 'request', id: 7, method: 'readTree', args: [] });
    const first = messages.filter((m) => m.kind === 'chunk').length;
    bridge.receive({ channel: CHANNEL, kind: 'cancel', id: 7 });
    await drain(20);
    expect(first).toBe(1);
    expect(messages.filter((m) => m.kind === 'chunk')).toHaveLength(1);
    expect(messages.find((m) => m.kind === 'response' && m.id === 7)).toBeUndefined();
  });

  it('answers not-connected before the app enables devtools', async () => {
    bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
    await bridge.handle({ channel: CHANNEL, kind: 'request', id: 3, method: 'readTree', args: [] });
    expect(messages.find((m) => m.kind === 'response')).toMatchObject({ id: 3, ok: false, error: 'not-connected' });
  });
});
