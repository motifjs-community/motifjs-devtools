import { CHANNEL, isBridgeMessage, type BridgeMessage } from '../../src/bridge/protocol';
import type { Port } from '../../src/client/client';
import { PANEL_PREFIX } from './messages';

type Runtime = { connect(info: { name: string }): chrome.runtime.Port };

export function panelPort(runtime: Runtime, tabId: number, retry = 300): Port {
  const handlers = new Set<(message: BridgeMessage) => void>();
  let port: chrome.runtime.Port | null = null;
  let closed = false;

  const open = (announce: boolean) => {
    const opened = runtime.connect({ name: `${PANEL_PREFIX}${tabId}` });
    port = opened;
    opened.onMessage.addListener((message) => {
      if (!isBridgeMessage(message)) return;
      for (const handler of handlers) handler(message);
    });
    opened.onDisconnect.addListener(() => {
      if (port !== opened) return;
      port = null;
      if (!closed) setTimeout(() => open(true), retry);
    });
    if (announce) opened.postMessage({ channel: CHANNEL, kind: 'hello' });
  };

  open(false);

  return {
    post(message) {
      port?.postMessage(message);
    },
    listen(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          closed = true;
          port?.disconnect();
          port = null;
        }
      };
    },
  };
}
