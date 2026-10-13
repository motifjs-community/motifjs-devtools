import { isBridgeMessage, type BridgeMessage } from '../bridge/protocol';
import type { Port } from '../client/client';

export function windowPort(own: Window, peer: () => Window | null): Port {
  const origin = own.location.origin === 'null' ? '*' : own.location.origin;
  return {
    post(message: BridgeMessage) {
      peer()?.postMessage(message, origin);
    },
    listen(handler) {
      const onMessage = (event: MessageEvent) => {
        const from = peer();
        if (from === null || event.source !== from || !isBridgeMessage(event.data)) return;
        handler(event.data);
      };
      own.addEventListener('message', onMessage);
      return () => own.removeEventListener('message', onMessage);
    },
  };
}
