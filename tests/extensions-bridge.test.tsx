import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Component, reactive } from '@motifx/core';
import { registerDevtools, runOperation, type DevtoolsExtension, type DevtoolsExtensionHandle } from '@motifx/core/devtools';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { CONCURRENT_CALLS, EVENT_RATE, EVENT_SIZE, MAX_EXTENSIONS, MAX_PANELS, PANELS_NODES, SOURCE_SIZE } from '../src/bridge/limits';
import { CHANNEL, type BridgeMessage, type BridgeResponse } from '../src/bridge/protocol';
import { MARK } from '../src/bridge/serialize';
import { drain, eventsIn, microScheduler } from './helpers';

class Counter extends Component<HTMLDivElement> {
  state = reactive({ count: 0 });
  override view() {
    return <span>{this.state.count}</span>;
  }
}

type Answer = { ok: boolean; value?: unknown; error?: string };

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;
const handles: DevtoolsExtensionHandle[] = [];

const start = () => {
  bridge = createBridge({ send: (message) => messages.push(message), interval: 10, scheduler: microScheduler });
  return bridge;
};

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)!;
};

const answer = async (method: string, ...args: unknown[]) => {
  const response = await call(method, ...args);
  expect(response.ok, method).toBe(true);
  return (response as { value: Answer }).value;
};

const runApp = () => {
  document.body.innerHTML = '<div id="app"></div>';
  app = Application.CreateBuilder().build();
  app.useDevelopment(true);
  app.run('#app', new Counter());
};

const register = (name: string, extension: DevtoolsExtension) => {
  const handle = registerDevtools(name, extension);
  handles.push(handle);
  return handle;
};

const history = (): DevtoolsExtension => ({
  sources: {
    rows: { read: (params: { n: number }) => Array.from({ length: params.n }, (_, i) => ({ id: i, name: `row ${i}` })), key: 'id', events: { 'row:added': 'upsert' }, max: 100 },
    one: { read: (params: { id: number }) => ({ id: params.id, deep: { a: { b: { c: 1 } } } }) },
  },
  commands: {
    done: (args: { id: number }) => `done ${args.id}`,
    hang: () => new Promise(() => {}),
  },
  panels: [
    { id: 'list', title: 'History', icon: 'timeline', order: 30, capabilities: { read: true, subscribe: true, write: true }, layout: { type: 'json', source: 'rows' } },
    { id: 'quiet', title: 'Quiet' },
  ],
});

beforeEach(() => {
  messages = [];
});

afterEach(async () => {
  for (const handle of handles.splice(0)) handle.dispose();
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

describe('bridge: extension panels, sources and commands', () => {
  it('answers the panels, the source settings and the command names as JSON', async () => {
    register('history', history());
    runApp();
    start();
    const result = await answer('readExtensionPanels', 'history');
    expect(result).toEqual({
      ok: true,
      value: {
        panels: [
          { id: 'list', title: 'History', icon: 'timeline', order: 30, capabilities: { read: true, subscribe: true, write: true }, layout: { type: 'json', source: 'rows' } },
          { id: 'quiet', title: 'Quiet' },
        ],
        sources: { rows: { key: 'id', events: { 'row:added': 'upsert' }, max: 100 }, one: {} },
        commands: ['done', 'hang'],
      },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(await answer('readExtensionPanels', 'missing')).toEqual({ ok: false, error: 'no extension' });
  });

  it('reads a source from a panel with read and refuses it from one without', async () => {
    register('history', history());
    runApp();
    start();
    expect(await answer('readExtensionSource', 'history', 'list', 'rows', { n: 2 })).toEqual({ ok: true, value: [{ id: 0, name: 'row 0' }, { id: 1, name: 'row 1' }] });
    expect(await answer('readExtensionSource', 'history', 'list', 'one', { id: 7 })).toEqual({ ok: true, value: { id: 7, deep: { a: { b: { c: 1 } } } } });
    expect(await answer('readExtensionSource', 'history', 'quiet', 'rows', { n: 1 })).toEqual({ ok: false, error: 'not allowed' });
    expect(await answer('readExtensionSource', 'history', 'list', 'constructor', {})).toEqual({ ok: false, error: 'no source' });
  });

  it('sends a long list whole up to the size limit and marks the rows it leaves out', async () => {
    const total = 30_000;
    register('big', { sources: { rows: { read: () => Array.from({ length: total }, (_, i) => `row ${i} ${'x'.repeat(60)}`) } }, panels: [{ id: 'p', title: 'P', capabilities: { read: true } }] });
    runApp();
    start();
    const result = (await answer('readExtensionSource', 'big', 'p', 'rows', {})) as { ok: true; value: unknown[] };
    expect(result.ok).toBe(true);
    const rows = result.value;
    const last = rows.at(-1) as { [MARK]?: string; remaining?: number };
    expect(last[MARK]).toBe('truncated');
    expect(rows.length - 1 + last.remaining!).toBe(total);
    expect(rows.length).toBeGreaterThan(100);
    expect(JSON.stringify(rows).length).toBeLessThanOrEqual(SOURCE_SIZE + 100);
  });

  it('refuses panel metadata that is too deep or too big', async () => {
    let deep: Record<string, unknown> = { type: 'text' };
    for (let i = 0; i < 40; i++) deep = { type: 'stack', children: [deep] };
    register('deep', { panels: [{ id: 'p', title: 'P', layout: deep }] });
    register('wide', { panels: [{ id: 'p', title: 'P', layout: { type: 'stack', children: Array.from({ length: PANELS_NODES }, () => ({ type: 'text' })) } }] });
    register('fat', { panels: [{ id: 'p', title: 'x'.repeat(300_000) }] });
    runApp();
    start();
    for (const name of ['deep', 'wide', 'fat']) expect(await answer('readExtensionPanels', name), name).toEqual({ ok: false, error: 'panels-too-large' });
  });

  it('runs a command from a panel with write, refuses it elsewhere, and reports a hanging one as timed out', async () => {
    vi.useFakeTimers();
    register('history', history());
    runApp();
    start();
    expect(await answer('callExtension', 'history', 'list', 'done', { id: 3 })).toEqual({ ok: true, value: 'done 3' });
    expect(await answer('callExtension', 'history', 'quiet', 'done', { id: 3 })).toEqual({ ok: false, error: 'not allowed' });
    expect(await answer('callExtension', 'history', 'list', 'toString', {})).toEqual({ ok: false, error: 'no command' });
    const hanging = answer('callExtension', 'history', 'list', 'hang', {});
    await vi.advanceTimersByTimeAsync(9_999);
    expect(messages.some((m) => m.kind === 'response' && m.id === nextId - 1)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await hanging).toEqual({ ok: false, error: 'timeout' });
  });

  it('forwards operation and extension events like any other event', async () => {
    const handle = register('history', history());
    runApp();
    start();
    runOperation({ kind: 'action', name: 'add' }, () => {});
    handle.changed('rows');
    handle.reveal({ panel: 'list', state: { rowId: 1 } });
    await drain();
    const events = eventsIn(messages);
    expect(events.find((e) => e.type === 'operation:started')?.payload).toMatchObject({ kind: 'action', name: 'add' });
    const finished = events.find((e) => e.type === 'operation:finished')?.payload as { id: number; duration: number; error?: string };
    expect(typeof finished.duration).toBe('number');
    expect(finished).not.toHaveProperty('error');
    expect(events.find((e) => e.type === 'extension:changed')?.payload).toEqual({ name: 'history', source: 'rows' });
    expect(events.find((e) => e.type === 'extension:reveal')?.payload).toEqual({ name: 'history', target: { panel: 'list', state: { rowId: 1 } } });
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it('answers busy past the limit of calls a package has in flight, and frees the place when one settles', async () => {
    vi.useFakeTimers();
    register('history', history());
    register('other', history());
    runApp();
    start();
    const hanging = Array.from({ length: CONCURRENT_CALLS }, () => answer('callExtension', 'history', 'list', 'hang', {}));
    expect(await answer('callExtension', 'history', 'list', 'done', { id: 1 })).toEqual({ ok: false, error: 'busy' });
    expect(await answer('callExtension', 'other', 'list', 'done', { id: 1 })).toEqual({ ok: true, value: 'done 1' });
    await vi.advanceTimersByTimeAsync(10_000);
    for (const call of hanging) expect(await call).toEqual({ ok: false, error: 'timeout' });
    expect(await answer('callExtension', 'history', 'list', 'done', { id: 2 })).toEqual({ ok: true, value: 'done 2' });
  });

  it('refuses a package with more panels than the limit and cuts the list of packages with a marker', async () => {
    register('many', { panels: Array.from({ length: MAX_PANELS + 1 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, layout: { type: 'text' } })) });
    for (let i = 0; i < MAX_EXTENSIONS + 2; i++) register(`pkg-${String(i).padStart(2, '0')}`, {});
    runApp();
    start();
    expect(await answer('readExtensionPanels', 'many')).toEqual({ ok: false, error: 'too-many-panels' });
    const names = (await call('getExtensions')) as { value: unknown[] };
    expect(names.value).toHaveLength(MAX_EXTENSIONS + 1);
    expect(names.value.at(-1)).toEqual({ [MARK]: 'truncated', remaining: 3 });
  });

  it('copies a package event deeper than its own events and replaces one that is too big by its size', async () => {
    const handle = register('history', history());
    runApp();
    start();
    handle.emit('deep', { a: { b: { c: { d: { e: { f: 'reached' } } } } } });
    handle.emit('fat', { text: 'x'.repeat(EVENT_SIZE) });
    await drain();
    const events = eventsIn(messages);
    expect(events.find((e) => e.type === 'ext:history:deep')?.payload).toEqual({ a: { b: { c: { d: { e: { f: 'reached' } } } } } });
    expect(events.find((e) => e.type === 'ext:history:fat')?.payload).toEqual({ [MARK]: 'truncated', size: EVENT_SIZE + 11 });
  });

  it('lets a package send up to the rate per second, drops the rest and tells how many once the second is over', async () => {
    vi.useFakeTimers();
    const handle = register('history', history());
    runApp();
    start();
    for (let i = 0; i < EVENT_RATE + 25; i++) handle.emit('tick', i);
    await drain();
    const first = eventsIn(messages).filter((e) => e.type === 'ext:history:tick');
    expect(first).toHaveLength(EVENT_RATE);
    expect(first.at(-1)?.payload).toBe(EVENT_RATE - 1);
    expect(eventsIn(messages).some((e) => e.type === 'devtools:ext-dropped')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    handle.emit('tick', 'next second');
    await drain();
    expect(eventsIn(messages).find((e) => e.type === 'devtools:ext-dropped')?.payload).toEqual({ name: 'history', count: 25 });
    expect(eventsIn(messages).filter((e) => e.type === 'ext:history:tick')).toHaveLength(EVENT_RATE + 1);
  });

  it('answers unknown-method for the new methods on a core without them', async () => {
    (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__ = { version: 2, coreVersion: '1.2.0', on: () => () => {}, getExtensions: () => [] };
    start();
    expect(await call('readExtensionPanels', 'x')).toMatchObject({ ok: false, error: 'unknown-method' });
    expect(await call('callExtension', 'x', 'p', 'c', {})).toMatchObject({ ok: false, error: 'unknown-method' });
  });
});
