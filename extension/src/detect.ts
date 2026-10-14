import { DETECT_SOURCE, detectionOf, type DetectMessage } from './messages';

const KEY = '__MOTIF_DEVTOOLS__';

export function installDetector(target: Record<string, unknown>, post: (message: DetectMessage) => void) {
  const announce = (api: unknown) => post({ source: DETECT_SOURCE, ...detectionOf(api) });
  if (Object.getOwnPropertyDescriptor(target, KEY) !== undefined) {
    announce(target[KEY]);
    return;
  }
  let value: unknown;
  try {
    Object.defineProperty(target, KEY, {
      configurable: true,
      enumerable: false,
      get: () => value,
      set(next: unknown) {
        value = next;
        announce(next);
      },
    });
  } catch {}
}
