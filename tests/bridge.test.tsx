import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Component, reactive } from '@motifx/core';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { CHANNEL, type BridgeMessage, type BridgeResponse } from '../src/bridge/protocol';
import { tick } from './helpers';

class Counter extends Component<HTMLDivElement> {
  state = reactive({ count: 0 });
  override view() {
    return <span>{this.state.count}</span>;
  }
}

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;

const start = () => {
  bridge = createBridge({ send: (message) => messages.push(message), interval: 10 });
  return bridge;
};

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)!;
};

const runApp = () => {
  document.body.innerHTML = '<div id="app"></div>';
  app = Application.CreateBuilder().build();
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
    expect(messages.at(-1)).toMatchObject({ channel: CHANNEL, kind: 'status', connected: true, version: 1 });
    expect(messages.filter((m) => m.kind === 'status')).toHaveLength(2);
  });

  it('refuses an unknown contract version', () => {
    (globalThis as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__ = { version: 2, on: () => () => {} };
    start();
    expect(messages.at(-1)).toMatchObject({ channel: CHANNEL, kind: 'status', connected: false, version: 2, reason: 'unsupported-version' });
    expect(bridge!.connected).toBe(false);
  });

  it('answers not-connected before the app enables devtools', async () => {
    start();
    expect(await call('getTree')).toMatchObject({ ok: false, error: 'not-connected' });
  });

  it('returns JSON-safe results for reads', async () => {
    runApp();
    start();
    for (const method of ['getTree', 'getCounters', 'getWarnings', 'getErrors', 'getStores', 'getServices', 'getNavigations', 'getExtensions']) {
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
    await tick();
    await tick();
    const flush = messages.find((m) => m.kind === 'event' && m.event.type === 'reactivity:flush');
    expect(flush).toBeDefined();
    expect(JSON.parse(JSON.stringify(flush))).toEqual(flush);
  });

  it('passes write results back', async () => {
    runApp();
    start();
    expect(await call('setClass', [0], 'picked', true)).toMatchObject({ ok: true });
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
