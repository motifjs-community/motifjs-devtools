import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL } from '../src/bridge/protocol';
import { installDetector } from '../extension/src/detect';
import { BRIDGE_KEY, CONTENT_SOURCE, DETECT_SOURCE, PAGE_SOURCE } from '../extension/src/messages';
import { startPageBridge } from '../extension/src/pageBridge';
import { panelPort } from '../extension/src/panelPort';
import { startContentRelay } from '../extension/src/relay';
import { iconPaths, startRouter, type ChromeApi } from '../extension/src/router';

type Listener = (...args: never[]) => void;

function event<T extends Listener>() {
  const listeners = new Set<T>();
  return {
    addListener: (listener: T) => listeners.add(listener),
    removeListener: (listener: T) => listeners.delete(listener),
    fire: (...args: Parameters<T>) => listeners.forEach((l) => l(...args)),
  };
}

type FakePort = {
  name: string;
  sender?: chrome.runtime.MessageSender;
  sent: unknown[];
  disconnected: boolean;
  onMessage: ReturnType<typeof event<(message: unknown, port: chrome.runtime.Port) => void>>;
  onDisconnect: ReturnType<typeof event<(port: chrome.runtime.Port) => void>>;
  postMessage(message: unknown): void;
  disconnect(): void;
};

function fakePort(name: string, sender?: chrome.runtime.MessageSender): FakePort {
  const port: FakePort = {
    name,
    sender,
    sent: [],
    disconnected: false,
    onMessage: event<(message: unknown, port: chrome.runtime.Port) => void>(),
    onDisconnect: event<(port: chrome.runtime.Port) => void>(),
    postMessage: (message) => port.sent.push(message),
    disconnect: () => {
      port.disconnected = true;
    },
  };
  return port;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const fromPage = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: window }));

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>)[BRIDGE_KEY];
});

describe('detector', () => {
  it('announces the contract when the core puts it on the page', () => {
    const target: Record<string, unknown> = {};
    const posted: unknown[] = [];
    installDetector(target, (m) => posted.push(m));
    expect(posted).toEqual([]);
    target.__MOTIF_DEVTOOLS__ = { version: 1, coreVersion: '1.2.0-rc.6', on: () => () => {} };
    expect((target.__MOTIF_DEVTOOLS__ as { version: number }).version).toBe(1);
    expect(Object.keys(target)).toEqual([]);
    delete target.__MOTIF_DEVTOOLS__;
    expect(posted).toEqual([{ source: DETECT_SOURCE, found: true, version: 1, coreVersion: '1.2.0-rc.6' }]);
  });

  it('announces a contract that is already there', () => {
    const posted: unknown[] = [];
    installDetector({ __MOTIF_DEVTOOLS__: { version: 1, on: () => {} } }, (m) => posted.push(m));
    expect(posted).toEqual([{ source: DETECT_SOURCE, found: true, version: 1, coreVersion: null }]);
  });
});

describe('content relay', () => {
  it('passes detection on, connects when asked and carries messages both ways', async () => {
    const onMessage = event<(message: unknown) => void>();
    const port = fakePort('content');
    const runtime = { connect: vi.fn(() => port as unknown as chrome.runtime.Port), sendMessage: vi.fn(() => Promise.resolve()), onMessage };
    const toPage: unknown[] = [];
    const listener = (e: MessageEvent) => toPage.push(e.data);
    startContentRelay(window, runtime);
    window.addEventListener('message', listener);

    fromPage({ source: DETECT_SOURCE, found: true, version: 1, coreVersion: '1.2.0-rc.6' });
    await flush();
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: 'detected', found: true, version: 1, coreVersion: '1.2.0-rc.6' });

    fromPage({ source: PAGE_SOURCE, message: { lost: true } });
    onMessage.fire({ type: 'connect' });
    onMessage.fire({ type: 'connect' });
    expect(runtime.connect).toHaveBeenCalledTimes(1);
    fromPage({ source: PAGE_SOURCE, message: { kind: 'status' } });
    await flush();
    expect(port.sent).toEqual([{ kind: 'status' }]);

    port.onMessage.fire({ kind: 'request' }, port as never);
    port.onDisconnect.fire(port as never);
    await flush();
    expect(toPage).toContainEqual({ source: CONTENT_SOURCE, message: { kind: 'request' } });
    expect(toPage).toContainEqual({ source: CONTENT_SOURCE, stop: true });
    window.removeEventListener('message', listener);
  });
});

describe('page bridge', () => {
  it('starts once, answers through the page and stops when the panel goes away', async () => {
    const win = window as unknown as Window & Record<string, unknown>;
    const bridge = startPageBridge(win);
    expect(startPageBridge(win)).toBe(bridge);
    const dispose = vi.spyOn(bridge, 'dispose');
    const sent: unknown[] = [];
    const listener = (e: MessageEvent) => {
      if ((e.data as { source?: string }).source === PAGE_SOURCE) sent.push(e.data.message);
    };
    window.addEventListener('message', listener);
    fromPage({ source: CONTENT_SOURCE, message: { channel: CHANNEL, kind: 'hello' } });
    await flush();
    expect(sent).toContainEqual(expect.objectContaining({ channel: CHANNEL, kind: 'status', connected: false }));
    fromPage({ source: CONTENT_SOURCE, stop: true });
    await flush();
    expect(dispose).toHaveBeenCalled();
    expect(win[BRIDGE_KEY]).toBeUndefined();
    window.removeEventListener('message', listener);
  });
});

function fakeChrome() {
  const onConnect = event<(port: chrome.runtime.Port) => void>();
  const onMessage = event<(message: unknown, sender: chrome.runtime.MessageSender) => void>();
  const onUpdated = event<(tabId: number, change: { status?: string }) => void>();
  const onRemoved = event<(tabId: number) => void>();
  const api = {
    runtime: { onConnect, onMessage },
    tabs: { sendMessage: vi.fn(() => Promise.resolve()), onUpdated, onRemoved },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    action: { setIcon: vi.fn(() => Promise.resolve()), setTitle: vi.fn(() => Promise.resolve()) },
  };
  return { api, onConnect, onMessage, onUpdated };
}

describe('background router', () => {
  it('injects the bridge for a panel and pairs it with the content script of its tab', async () => {
    const chromeApi = fakeChrome();
    const { panels, contents } = startRouter(chromeApi.api as unknown as ChromeApi);
    const panel = fakePort('panel:7');
    chromeApi.onConnect.fire(panel as never);
    await flush();
    expect(chromeApi.api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, world: 'MAIN', files: ['page.js'] });
    expect(chromeApi.api.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'connect' });

    const stray = fakePort('content', { tab: { id: 8 }, frameId: 0 });
    chromeApi.onConnect.fire(stray as never);
    expect(stray.disconnected).toBe(true);

    const content = fakePort('content', { tab: { id: 7 }, frameId: 0 });
    chromeApi.onConnect.fire(content as never);
    expect(content.sent).toEqual([{ channel: CHANNEL, kind: 'hello' }]);
    panel.onMessage.fire({ kind: 'request' }, panel as never);
    content.onMessage.fire({ kind: 'response' }, content as never);
    expect(content.sent).toContainEqual({ kind: 'request' });
    expect(panel.sent).toEqual([{ kind: 'response' }]);

    panel.onDisconnect.fire(panel as never);
    expect(panels.size).toBe(0);
    expect(contents.size).toBe(0);
    expect(content.disconnected).toBe(true);
  });

  it('attaches again after the inspected page loads a new document', async () => {
    const chromeApi = fakeChrome();
    startRouter(chromeApi.api as unknown as ChromeApi);
    chromeApi.onConnect.fire(fakePort('panel:3') as never);
    await flush();
    chromeApi.onUpdated.fire(3, { status: 'complete' });
    chromeApi.onUpdated.fire(4, { status: 'complete' });
    await flush();
    expect(chromeApi.api.scripting.executeScript).toHaveBeenCalledTimes(2);
  });

  it('colors the toolbar icon of a tab where MotifJS runs in development mode', () => {
    const chromeApi = fakeChrome();
    startRouter(chromeApi.api as unknown as ChromeApi);
    chromeApi.onMessage.fire({ type: 'detected', found: true, version: 1, coreVersion: '1.2.0-rc.6' }, { tab: { id: 5 }, frameId: 0 });
    chromeApi.onMessage.fire({ type: 'detected', found: true, version: 1, coreVersion: '1.2.0-rc.6' }, { tab: { id: 5 }, frameId: 2 });
    expect(chromeApi.api.action.setIcon).toHaveBeenCalledTimes(1);
    expect(chromeApi.api.action.setIcon).toHaveBeenCalledWith({ tabId: 5, path: iconPaths('active') });
    expect(chromeApi.api.action.setTitle).toHaveBeenCalledWith({ tabId: 5, title: 'MotifJS 1.2.0-rc.6 in development mode: open DevTools and choose the MotifJS tab' });
  });
});

describe('panel port', () => {
  it('connects for its tab and connects again with a hello when the worker restarts', () => {
    vi.useFakeTimers();
    const opened: FakePort[] = [];
    const runtime = {
      connect: vi.fn((info: { name: string }) => {
        const port = fakePort(info.name);
        opened.push(port);
        return port as unknown as chrome.runtime.Port;
      }),
    };
    const port = panelPort(runtime, 9, 100);
    const received: unknown[] = [];
    const stop = port.listen((m) => received.push(m));
    expect(opened[0].name).toBe('panel:9');
    opened[0].onMessage.fire({ channel: CHANNEL, kind: 'status', connected: true, version: 1 }, opened[0] as never);
    opened[0].onMessage.fire({ unrelated: true }, opened[0] as never);
    expect(received).toEqual([{ channel: CHANNEL, kind: 'status', connected: true, version: 1 }]);

    opened[0].onDisconnect.fire(opened[0] as never);
    vi.advanceTimersByTime(100);
    expect(opened).toHaveLength(2);
    expect(opened[1].sent).toEqual([{ channel: CHANNEL, kind: 'hello' }]);
    port.post({ channel: CHANNEL, kind: 'hello' });
    expect(opened[1].sent).toHaveLength(2);

    stop();
    expect(opened[1].disconnected).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(2);
  });
});
