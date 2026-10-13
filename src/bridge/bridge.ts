import {
  CHANNEL,
  CONTRACT_VERSION,
  PAGE_METHODS,
  READ_METHODS,
  WRITE_METHODS,
  isBridgeMessage,
  type BridgeMessage,
  type BridgeRequest,
  type BridgeStatus,
  type PageMemory,
} from './protocol';
import { createPicker, type Picker } from './picker';
import { toTransfer } from './serialize';

type Contract = {
  version: number;
  on(listener: (event: { type: string; payload?: unknown }) => void): () => void;
  [method: string]: unknown;
};

export interface BridgeOptions {
  send(message: BridgeMessage): void;
  host?: object;
  interval?: number;
  picker?: boolean;
}

export interface Bridge {
  readonly connected: boolean;
  handle(request: BridgeRequest): Promise<void>;
  receive(message: unknown): void;
  check(): void;
  dispose(): void;
}

const METHODS = new Set<string>([...READ_METHODS, ...WRITE_METHODS]);
const OWN_METHODS = new Set<string>(PAGE_METHODS);
const DEPTH: Record<string, number> = { getTree: Infinity, inspect: 6, readExtension: 6, getWarnings: 6, getErrors: 8, getScopes: 6, readValue: 6, readStore: 6, readService: 6 };

type StoreRecord = { id: unknown; name: unknown; file?: unknown; type: unknown; value: unknown; stale?: unknown; released?: unknown; holders: unknown };

const routeShape = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((route) => {
        if (typeof route !== 'object' || route === null) return toTransfer(route, 1);
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(route)) {
          if (item === undefined) continue;
          out[key] = key === 'childs' ? routeShape(item) : toTransfer(item, 3);
        }
        return out;
      })
    : toTransfer(value, 3);

const pageTime = () => (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number' ? performance.timeOrigin + performance.now() : Date.now());

const readMemory = (): PageMemory | null => {
  const memory = (globalThis as { performance?: { memory?: { usedJSHeapSize?: unknown; totalJSHeapSize?: unknown; jsHeapSizeLimit?: unknown } } }).performance?.memory;
  if (memory === undefined || typeof memory.usedJSHeapSize !== 'number') return null;
  return { used: memory.usedJSHeapSize, total: Number(memory.totalJSHeapSize) || 0, limit: Number(memory.jsHeapSizeLimit) || 0 };
};

const SHAPES: Record<string, (value: unknown) => unknown> = {
  getRoutes: routeShape,
  getStores: (value) =>
    Array.isArray(value)
      ? value.map((store: StoreRecord) => {
          const out: Record<string, unknown> = { id: store.id, name: store.name, type: store.type, value: toTransfer(store.value, 2), holders: toTransfer(store.holders, 4) };
          if (typeof store.file === 'string') out.file = store.file;
          if (store.stale !== undefined) out.stale = store.stale;
          if (store.released !== undefined) out.released = store.released;
          return out;
        })
      : toTransfer(value, 4),
};

export function createBridge({ send, host = globalThis, interval = 250, picker: withPicker = typeof document !== 'undefined' }: BridgeOptions): Bridge {
  let api: Contract | null = null;
  let picker: Picker | null = null;
  let off: (() => void) | null = null;
  let lastStatus = '';
  let disposed = false;

  const sendStatus = (status: Omit<BridgeStatus, 'channel' | 'kind'>) => {
    const key = JSON.stringify(status);
    if (key === lastStatus) return;
    lastStatus = key;
    const address = (globalThis as { location?: { host?: string } }).location?.host;
    send({ channel: CHANNEL, kind: 'status', ...status, ...(address ? { host: address } : {}) });
  };

  const transferEvent = (event: { type: string; payload?: unknown }) => ({
    type: event.type,
    payload: toTransfer(event.payload, event.type === 'reactivity:flush' ? 6 : 4),
    time: pageTime(),
  });

  const pickerOf = () => {
    if (!withPicker) return null;
    picker ??= createPicker(
      () => api as never,
      (type, payload) => send({ channel: CHANNEL, kind: 'event', event: { type, payload: toTransfer(payload) } }),
    );
    return picker;
  };

  const check = () => {
    if (disposed) return;
    const found = (host as { __MOTIF_DEVTOOLS__?: unknown }).__MOTIF_DEVTOOLS__;
    const candidate = typeof found === 'object' && found !== null && typeof (found as Contract).on === 'function' ? (found as Contract) : null;
    const next = candidate !== null && candidate.version === CONTRACT_VERSION ? candidate : null;
    if (next !== api) {
      off?.();
      off = null;
      picker?.setPicking(false);
      picker?.highlight(null);
      api = next;
      if (api !== null) off = api.on((event) => send({ channel: CHANNEL, kind: 'event', event: transferEvent(event) }));
    }
    if (api !== null) sendStatus(typeof api.coreVersion === 'string' ? { connected: true, version: api.version, coreVersion: api.coreVersion } : { connected: true, version: api.version });
    else if (candidate !== null) sendStatus({ connected: false, version: typeof candidate.version === 'number' ? candidate.version : null, reason: 'unsupported-version' });
    else sendStatus({ connected: false, version: null, reason: 'missing' });
  };

  const reply = (id: number, ok: boolean, valueOrError: unknown) => {
    send(ok
      ? { channel: CHANNEL, kind: 'response', id, ok: true, value: valueOrError }
      : { channel: CHANNEL, kind: 'response', id, ok: false, error: String(valueOrError) });
  };

  const timer = setInterval(check, interval);
  check();

  const bridge: Bridge = {
    get connected() {
      return api !== null;
    },
    check,
    receive(message) {
      if (disposed || !isBridgeMessage(message)) return;
      if (message.kind === 'hello') {
        lastStatus = '';
        check();
      } else if (message.kind === 'request') {
        void bridge.handle(message);
      }
    },
    async handle(request) {
      if (disposed) return;
      check();
      if (request.method === 'getMemory') return reply(request.id, true, readMemory());
      if (OWN_METHODS.has(request.method)) {
        const own = pickerOf();
        if (own === null || api === null) return reply(request.id, false, own === null ? 'unknown-method' : 'not-connected');
        const [arg] = Array.isArray(request.args) ? request.args : [];
        const path = Array.isArray(arg) && arg.every((n) => Number.isInteger(n)) ? (arg as number[]) : null;
        return reply(request.id, true, request.method === 'pick' ? own.setPicking(arg === true) : own.highlight(path));
      }
      if (!METHODS.has(request.method)) return reply(request.id, false, 'unknown-method');
      if (api === null) return reply(request.id, false, 'not-connected');
      const method = api[request.method];
      if (typeof method !== 'function') return reply(request.id, false, 'unknown-method');
      try {
        const value = await method.apply(api, Array.isArray(request.args) ? request.args : []);
        const shape = SHAPES[request.method];
        reply(request.id, true, shape !== undefined ? shape(value) : toTransfer(value, DEPTH[request.method] ?? 4));
      } catch (error) {
        reply(request.id, false, error instanceof Error ? error.message : error);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      picker?.dispose();
      picker = null;
      off?.();
      off = null;
      api = null;
    },
  };
  return bridge;
}
