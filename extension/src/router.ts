import { CHANNEL } from '../../src/bridge/protocol';
import { CONTENT_PORT, PANEL_PREFIX, isObject, type Detection } from './messages';

export const ICON_SIZES = [16, 32, 48, 128] as const;
export const iconPaths = (state: 'active' | 'idle') => Object.fromEntries(ICON_SIZES.map((size) => [String(size), `icons/${state}-${size}.png`]));

type Port = chrome.runtime.Port;

export type ChromeApi = {
  runtime: {
    onConnect: { addListener(listener: (port: Port) => void): void };
    onMessage: { addListener(listener: (message: unknown, sender: chrome.runtime.MessageSender) => void): void };
  };
  tabs: {
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    onUpdated: { addListener(listener: (tabId: number, change: { status?: string }) => void): void };
    onRemoved: { addListener(listener: (tabId: number) => void): void };
  };
  scripting: { executeScript(details: { target: { tabId: number }; world: 'MAIN'; files: string[] }): Promise<unknown> };
  action: {
    setIcon(details: { tabId: number; path: Record<string, string> }): Promise<void>;
    setTitle(details: { tabId: number; title: string }): Promise<void>;
  };
};

export const titleOf = (detection: Detection) =>
  detection.found
    ? `MotifJS${detection.coreVersion === null ? '' : ` ${detection.coreVersion}`} in development mode: open DevTools and choose the MotifJS tab`
    : 'MotifJS DevTools: no MotifJS app in development mode on this page';

export function startRouter(api: ChromeApi) {
  const panels = new Map<number, Port>();
  const contents = new Map<number, Port>();

  const attach = async (tabId: number) => {
    try {
      await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page.js'] });
      await api.tabs.sendMessage(tabId, { type: 'connect' });
    } catch {}
  };

  const dropContent = (tabId: number) => {
    const content = contents.get(tabId);
    contents.delete(tabId);
    content?.disconnect();
  };

  api.runtime.onConnect.addListener((port) => {
    if (port.name.startsWith(PANEL_PREFIX)) {
      const tabId = Number(port.name.slice(PANEL_PREFIX.length));
      if (!Number.isInteger(tabId)) return port.disconnect();
      panels.get(tabId)?.disconnect();
      panels.set(tabId, port);
      port.onMessage.addListener((message) => contents.get(tabId)?.postMessage(message));
      port.onDisconnect.addListener(() => {
        if (panels.get(tabId) !== port) return;
        panels.delete(tabId);
        dropContent(tabId);
      });
      void attach(tabId);
      return;
    }
    const tabId = port.sender?.tab?.id;
    if (port.name !== CONTENT_PORT || tabId === undefined || (port.sender?.frameId ?? 0) !== 0 || !panels.has(tabId)) return port.disconnect();
    if (contents.get(tabId) !== port) dropContent(tabId);
    contents.set(tabId, port);
    port.onMessage.addListener((message) => panels.get(tabId)?.postMessage(message));
    port.onDisconnect.addListener(() => {
      if (contents.get(tabId) === port) contents.delete(tabId);
    });
    port.postMessage({ channel: CHANNEL, kind: 'hello' });
  });

  api.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    if (!isObject(message) || message.type !== 'detected' || tabId === undefined || (sender.frameId ?? 0) !== 0) return;
    const detection = message as unknown as Detection;
    void api.action.setIcon({ tabId, path: iconPaths(detection.found ? 'active' : 'idle') }).catch(() => {});
    void api.action.setTitle({ tabId, title: titleOf(detection) }).catch(() => {});
  });

  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'complete' && panels.has(tabId) && !contents.has(tabId)) void attach(tabId);
  });

  api.tabs.onRemoved.addListener((tabId) => {
    panels.delete(tabId);
    contents.delete(tabId);
  });

  return { panels, contents };
}
