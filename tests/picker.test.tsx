import { afterEach, describe, expect, it } from 'vitest';
import { Application, Component } from '@motifx/core';
import { createBridge, type Bridge } from '../src/bridge/bridge';
import { CHANNEL, type BridgeMessage, type BridgeResponse } from '../src/bridge/protocol';
import { drain, eventsIn, microScheduler } from './helpers';

function Card() {
  return (
    <article class="card">
      <b class="title">Title</b>
    </article>
  );
}

class Root extends Component<HTMLDivElement> {
  override view() {
    return <Card />;
  }
}

let app: Application | null = null;
let bridge: Bridge | null = null;
let messages: BridgeMessage[] = [];
let nextId = 1;

const call = async (method: string, ...args: unknown[]) => {
  const id = nextId++;
  await bridge!.handle({ channel: CHANNEL, kind: 'request', id, method, args });
  return messages.find((m): m is BridgeResponse => m.kind === 'response' && m.id === id)!;
};

const events = (type: string) => eventsIn(messages).filter((e) => e.type === type).map((e) => e.payload);
const overlay = () => document.querySelector('motif-devtools-overlay')?.shadowRoot ?? null;

const start = () => {
  document.body.innerHTML = '<div id="app"></div>';
  app = Application.CreateBuilder().build();
  app.useDevelopment(true);
  app.run('#app', new Root());
  messages = [];
  bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
};

afterEach(async () => {
  bridge?.dispose();
  bridge = null;
  if (app) {
    app.useDevelopment(false);
    await app.dispose?.();
  }
  app = null;
  document.body.innerHTML = '';
  document.querySelector('motif-devtools-overlay')?.remove();
});

describe('page picker', () => {
  it('highlights a component by path with its name and size', async () => {
    start();
    const tree = (await call('getTree')) as { value: { children: { children: { path: number[]; type: string }[] }[] } };
    const card = tree.value.children[0].children[0];
    expect(card.type).toBe('Card');
    expect(await call('highlight', card.path)).toMatchObject({ ok: true, value: true });
    const label = overlay()!.querySelector('.label') as HTMLElement;
    expect(label.hidden).toBe(false);
    expect(label.textContent).toContain('Card');
    expect(label.textContent).toContain('<article>');
    expect(await call('highlight', null)).toMatchObject({ ok: true, value: true });
    expect(label.hidden).toBe(true);
  });

  it('picks the clicked component and stops picking', async () => {
    start();
    expect(await call('pick', true)).toMatchObject({ ok: true, value: true });
    await drain();
    expect(events('devtools:pick')).toEqual([{ active: true }]);
    let reached = false;
    const title = document.querySelector('.title') as HTMLElement;
    title.addEventListener('click', () => (reached = true));
    title.click();
    expect(reached).toBe(false);
    await drain();
    const picked = events('devtools:picked') as { path: number[] }[];
    expect(picked).toHaveLength(1);
    const node = (await call('getTree', picked[0].path, 0)) as { value: { tag: string } };
    expect(node.value.tag).toBe('b');
    expect(events('devtools:pick')).toEqual([{ active: true }, { active: false }]);
    title.click();
    expect(reached).toBe(true);
  });

  it('cancels picking with Escape and ignores clicks inside the devtools host', async () => {
    start();
    await call('pick', true);
    const host = document.createElement('motif-devtools');
    document.body.appendChild(host);
    host.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await drain();
    expect(events('devtools:picked')).toHaveLength(0);
    expect(events('devtools:pick')).toEqual([{ active: true }, { active: false }]);
  });

  it('refuses to pick before the app enables devtools', async () => {
    bridge = createBridge({ send: (message) => messages.push(message), scheduler: microScheduler });
    expect(await call('pick', true)).toMatchObject({ ok: false, error: 'not-connected' });
  });
});
