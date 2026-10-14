import { CONTENT_PORT, CONTENT_SOURCE, DETECT_SOURCE, PAGE_SOURCE, isObject, type ContentMessage, type Detection } from './messages';

type Runtime = {
  connect(info: { name: string }): chrome.runtime.Port;
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: { addListener(listener: (message: unknown) => void): void };
};

export function startContentRelay(win: Window, runtime: Runtime) {
  let port: chrome.runtime.Port | null = null;
  const toPage = (message: ContentMessage) => win.postMessage(message, '*');

  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== win || !isObject(event.data)) return;
    const data = event.data;
    if (data.source === DETECT_SOURCE) {
      const { found, version, coreVersion } = data as unknown as Detection;
      runtime.sendMessage({ type: 'detected', found, version, coreVersion }).catch(() => {});
    } else if (data.source === PAGE_SOURCE && port !== null) {
      port.postMessage(data.message);
    }
  });

  runtime.onMessage.addListener((message) => {
    if (!isObject(message) || message.type !== 'connect' || port !== null) return;
    const opened = runtime.connect({ name: CONTENT_PORT });
    port = opened;
    opened.onMessage.addListener((payload) => toPage({ source: CONTENT_SOURCE, message: payload }));
    opened.onDisconnect.addListener(() => {
      if (port === opened) port = null;
      toPage({ source: CONTENT_SOURCE, stop: true });
    });
  });
}
