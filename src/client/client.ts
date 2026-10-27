import { CHANNEL, type BridgeMessage, type BridgeMethod, type BridgeStatus, type DockPosition } from '../bridge/protocol';

export interface Port {
  post(message: BridgeMessage): void;
  listen(handler: (message: BridgeMessage) => void): () => void;
}

export type ClientStatus = Omit<BridgeStatus, 'channel' | 'kind'>;
export type ClientEvent = { type: string; payload?: unknown; time?: number };

export interface Stream<T> {
  readonly done: Promise<T>;
  cancel(): void;
}

export interface Client {
  readonly status: ClientStatus;
  readonly dock: DockPosition | null;
  readonly shown: boolean;
  request<T = unknown>(method: BridgeMethod, ...args: unknown[]): Promise<T>;
  stream<C = unknown, T = unknown>(method: BridgeMethod, onChunk: (chunk: C) => void, ...args: unknown[]): Stream<T>;
  onEvent(listener: (event: ClientEvent) => void): () => void;
  onStatus(listener: (status: ClientStatus) => void): () => void;
  onDock(listener: (position: DockPosition) => void): () => void;
  onShown(listener: (shown: boolean) => void): () => void;
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
  let shown = true;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; chunk?: (value: unknown) => void }>();
  const eventListeners = new Set<(event: ClientEvent) => void>();
  const statusListeners = new Set<(status: ClientStatus) => void>();
  const dockListeners = new Set<(position: DockPosition) => void>();
  const shownListeners = new Set<(shown: boolean) => void>();

  const expire = (id: number) =>
    setTimeout(() => {
      const entry = pending.get(id);
      if (entry === undefined) return;
      pending.delete(id);
      entry.reject(new RequestError('timeout'));
    }, timeout);

  const dispatch = (event: ClientEvent) => {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const off = port.listen((message) => {
    if (message.kind === 'response') {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.value);
      else entry.reject(new RequestError(message.error));
    } else if (message.kind === 'events') {
      for (const event of message.events) dispatch(event);
    } else if (message.kind === 'chunk') {
      const entry = pending.get(message.id);
      if (entry?.chunk === undefined) return;
      clearTimeout(entry.timer);
      entry.timer = expire(message.id);
      entry.chunk(message.value);
    } else if (message.kind === 'visibility') {
      if (shown === message.shown) return;
      shown = message.shown;
      for (const listener of shownListeners) listener(shown);
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
    get shown() {
      return shown;
    },
    request<T>(method: BridgeMethod, ...args: unknown[]) {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer: expire(id) });
        port.post({ channel: CHANNEL, kind: 'request', id, method, args });
      });
    },
    stream<C, T>(method: BridgeMethod, onChunk: (chunk: C) => void, ...args: unknown[]): Stream<T> {
      const id = nextId++;
      const done = new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer: expire(id), chunk: onChunk as (value: unknown) => void });
        port.post({ channel: CHANNEL, kind: 'request', id, method, args });
      });
      return {
        done,
        cancel() {
          const entry = pending.get(id);
          if (entry === undefined) return;
          pending.delete(id);
          clearTimeout(entry.timer);
          entry.reject(new RequestError('cancelled'));
          port.post({ channel: CHANNEL, kind: 'cancel', id });
        },
      };
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
    onShown(listener) {
      shownListeners.add(listener);
      return () => shownListeners.delete(listener);
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
      shownListeners.clear();
    },
  };
}
