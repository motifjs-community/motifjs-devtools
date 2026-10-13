import { CHANNEL, type BridgeMessage, type BridgeMethod, type BridgeStatus, type DockPosition } from '../bridge/protocol';

export interface Port {
  post(message: BridgeMessage): void;
  listen(handler: (message: BridgeMessage) => void): () => void;
}

export type ClientStatus = Omit<BridgeStatus, 'channel' | 'kind'>;
export type ClientEvent = { type: string; payload?: unknown };

export interface Client {
  readonly status: ClientStatus;
  readonly dock: DockPosition | null;
  request<T = unknown>(method: BridgeMethod, ...args: unknown[]): Promise<T>;
  onEvent(listener: (event: ClientEvent) => void): () => void;
  onStatus(listener: (status: ClientStatus) => void): () => void;
  onDock(listener: (position: DockPosition) => void): () => void;
  setDock(position: DockPosition): void;
  dispose(): void;
}

export class RequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RequestError';
  }
}

export function createClient(port: Port, timeout = 5000): Client {
  let nextId = 1;
  let status: ClientStatus = { connected: false, version: null };
  let dock: DockPosition | null = null;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const eventListeners = new Set<(event: ClientEvent) => void>();
  const statusListeners = new Set<(status: ClientStatus) => void>();
  const dockListeners = new Set<(position: DockPosition) => void>();

  const off = port.listen((message) => {
    if (message.kind === 'response') {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.value);
      else entry.reject(new RequestError(message.error));
    } else if (message.kind === 'event') {
      for (const listener of eventListeners) listener(message.event);
    } else if (message.kind === 'status') {
      const { channel: _channel, kind: _kind, ...next } = message;
      status = next;
      for (const listener of statusListeners) listener(status);
    } else if (message.kind === 'dock') {
      dock = message.position;
      for (const listener of dockListeners) listener(dock);
    }
  });

  port.post({ channel: CHANNEL, kind: 'hello' });

  return {
    get status() {
      return status;
    },
    get dock() {
      return dock;
    },
    request<T>(method: BridgeMethod, ...args: unknown[]) {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new RequestError('timeout'));
        }, timeout);
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
        port.post({ channel: CHANNEL, kind: 'request', id, method, args });
      });
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    onDock(listener) {
      dockListeners.add(listener);
      return () => dockListeners.delete(listener);
    },
    setDock(position) {
      port.post({ channel: CHANNEL, kind: 'dock', position });
    },
    dispose() {
      off();
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new RequestError('disposed'));
      }
      pending.clear();
      eventListeners.clear();
      statusListeners.clear();
      dockListeners.clear();
    },
  };
}
