import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Component, reactive } from '@motifx/core';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { colorOf, createFlasher, FLASH_DURATION, FLASH_TAG, MAX_BOXES, touchesDom } from '../src/bridge/flash';
import { CHANNEL, type BridgeMessage, type BridgeResponse } from '../src/bridge/protocol';
import type { Client, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { drain, idleClient, microScheduler } from './helpers';

const note = reactive({ title: 'Groceries', done: false });

class Root extends Component<HTMLDivElement> {
  override view() {
    return (
      <article class={() => (note.done ? 'note done' : 'note')}>
        <b class="title">{() => note.title}</b>
        <span class="static">Saved</span>
      </article>
    );
  }
}

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;
const rect = Element.prototype.getBoundingClientRect;

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)!;
};

const layer = () => document.querySelector(FLASH_TAG)?.shadowRoot ?? null;
const boxes = () => [...(layer()?.querySelectorAll<HTMLElement>('.flash') ?? [])];

const start = () => {
  document.body.innerHTML = '<div id="app"></div>';
  note.title = 'Groceries';
  note.done = false;
  app = Application.CreateBuilder().build();
  app.useDevelopment(true);
  app.run('#app', new Root());
  messages = [];
  bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
};

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 10, top: 20, width: 120, height: 18, right: 130, bottom: 38, x: 10, y: 20, toJSON() {} } as DOMRect;
  };
});

afterEach(async () => {
  Element.prototype.getBoundingClientRect = rect;
  vi.useRealTimers();
  bridge?.dispose();
  bridge = null;
  if (app) {
    app.useDevelopment(false);
    await app.dispose?.();
  }
  app = null;
  document.body.innerHTML = '';
  document.querySelector(FLASH_TAG)?.remove();
});

describe('highlight updates', () => {
  it('draws nothing until it is turned on', async () => {
    start();
    note.title = 'Errands';
    await drain();
    expect(layer()).toBeNull();
  });

  it('flashes the element whose binding ran, once per frame', async () => {
    start();
    expect(await call('flashUpdates', true)).toMatchObject({ ok: true, value: true });
    note.title = 'Errands';
    note.title = 'Errands today';
    await drain();
    const drawn = boxes();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].style.left).toBe('10px');
    expect(drawn[0].style.width).toBe('120px');
    expect(drawn[0].style.getPropertyValue('--color')).toBe(colorOf(1));
    expect(drawn[0].querySelector('b')).toBeNull();
  });

  it('counts an element updated again within a second and warms its color', async () => {
    start();
    await call('flashUpdates', true);
    note.title = 'Errands';
    await drain();
    note.title = 'Errands today';
    await drain();
    const drawn = boxes();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].querySelector('b')!.textContent).toBe('×2');
    expect(drawn[0].style.getPropertyValue('--color')).toBe(colorOf(2));
  });

  it('flashes each element that changed in a flush', async () => {
    start();
    await call('flashUpdates', true);
    note.title = 'Errands';
    note.done = true;
    await drain();
    expect(boxes()).toHaveLength(2);
  });

  it('removes the boxes after they fade', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start();
    await call('flashUpdates', true);
    note.title = 'Errands';
    await drain();
    expect(boxes()).toHaveLength(1);
    vi.advanceTimersByTime(FLASH_DURATION + 1);
    expect(boxes()).toHaveLength(0);
  });

  it('clears the boxes when turned off and stops drawing', async () => {
    start();
    await call('flashUpdates', true);
    note.title = 'Errands';
    await drain();
    expect(await call('flashUpdates', false)).toMatchObject({ ok: true, value: false });
    expect(boxes()).toHaveLength(0);
    note.title = 'Errands today';
    await drain();
    expect(boxes()).toHaveLength(0);
  });

  it('skips an element that is not in the page or has no size', async () => {
    start();
    await call('flashUpdates', true);
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    };
    note.title = 'Errands';
    await drain();
    expect(boxes()).toHaveLength(0);
  });

  it('takes its layer out of the page when the bridge is disposed', async () => {
    start();
    await call('flashUpdates', true);
    note.title = 'Errands';
    await drain();
    expect(document.querySelector(FLASH_TAG)).not.toBeNull();
    bridge!.dispose();
    bridge = null;
    expect(document.querySelector(FLASH_TAG)).toBeNull();
  });
});

describe('highlight updates switch', () => {
  const panel = () => {
    const statuses = new Set<(status: ClientStatus) => void>();
    const calls: [string, unknown[]][] = [];
    const client: Client = {
      ...idleClient,
      status: { connected: false, version: null },
      dock: null,
      async request<T>(method: string, ...args: unknown[]) {
        calls.push([method, args]);
        return (method === 'getCounters' ? null : []) as T;
      },
      onEvent: () => () => {},
      onStatus(listener) {
        statuses.add(listener);
        return () => statuses.delete(listener);
      },
      onShown: () => () => {},
      onDock: () => () => {},
      setDock() {},
      dispose() {},
    };
    const model = new DevtoolsModel(client, { gap: 0 });
    return {
      model,
      flashCalls: () => calls.filter(([method]) => method === 'flashUpdates').map(([, args]) => args),
      connect: () => statuses.forEach((l) => l({ connected: true, version: 2 })),
    };
  };

  afterEach(() => localStorage.removeItem('motif-devtools:flash'));

  it('starts off and asks nothing of the page', async () => {
    const { model, flashCalls, connect } = panel();
    expect(model.state.flashing).toBe(false);
    connect();
    await drain();
    expect(flashCalls()).toEqual([]);
    model.dispose();
  });

  it('turns the page on and off and remembers the choice', async () => {
    const first = panel();
    await first.model.toggleFlash();
    expect(first.model.state.flashing).toBe(true);
    expect(first.flashCalls()).toEqual([[true]]);
    first.model.dispose();

    const second = panel();
    expect(second.model.state.flashing).toBe(true);
    second.connect();
    await drain();
    expect(second.flashCalls()).toEqual([[true]]);
    await second.model.toggleFlash();
    expect(second.flashCalls()).toEqual([[true], [false]]);
    expect(localStorage.getItem('motif-devtools:flash')).toBe('false');
    second.model.dispose();
  });
});

describe('flasher', () => {
  it('flashes only the effects that touch the page', () => {
    for (const kind of ['binding:text', 'attr:title', 'class', 'style', 'list', 'conditional', 'ternary', 'switch', 'when', 'method', 'virtual-data']) expect(touchesDom(kind)).toBe(true);
    for (const kind of ['watch', 'computed', 'effect', undefined, 3]) expect(touchesDom(kind)).toBe(false);
  });

  it(`draws at most ${MAX_BOXES} boxes in a frame`, async () => {
    document.body.innerHTML = '';
    const element = document.createElement('i');
    document.body.append(element);
    const flasher = createFlasher(() => ({ getElement: () => element }), microScheduler);
    flasher.setEnabled(true);
    flasher.flush({ effects: Array.from({ length: MAX_BOXES + 50 }, (_, i) => ({ path: [0, i], kind: 'binding:text' })) });
    await drain();
    expect(boxes()).toHaveLength(MAX_BOXES);
    flasher.dispose();
  });

  it('colors by how often an element updated', () => {
    expect([1, 2, 3, 4, 9, 10, 50].map(colorOf)).toEqual(['#ff8f66', '#f5703a', '#f5703a', '#e4572e', '#e4572e', '#c62828', '#c62828']);
  });
});
