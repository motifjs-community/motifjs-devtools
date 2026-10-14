import { createBridge, type Bridge } from '../../src/bridge/bridge';
import { BRIDGE_KEY, CONTENT_SOURCE, PAGE_SOURCE, isObject } from './messages';

export function startPageBridge(win: Window & Record<string, unknown>) {
  if (win[BRIDGE_KEY] !== undefined) return win[BRIDGE_KEY] as Bridge;
  const bridge = createBridge({ send: (message) => win.postMessage({ source: PAGE_SOURCE, message }, '*') });
  const onMessage = (event: MessageEvent) => {
    if (event.source !== win || !isObject(event.data) || event.data.source !== CONTENT_SOURCE) return;
    if (event.data.stop === true) {
      win.removeEventListener('message', onMessage);
      bridge.dispose();
      delete win[BRIDGE_KEY];
      return;
    }
    bridge.receive(event.data.message);
  };
  win.addEventListener('message', onMessage);
  win[BRIDGE_KEY] = bridge;
  return bridge;
}
