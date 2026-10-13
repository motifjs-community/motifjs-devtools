export const CHANNEL = 'motif-devtools';
export const CONTRACT_VERSION = 1;

export type BridgeRequest = { channel: typeof CHANNEL; kind: 'request'; id: number; method: string; args: unknown[] };

export type BridgeResponse =
  | { channel: typeof CHANNEL; kind: 'response'; id: number; ok: true; value: unknown }
  | { channel: typeof CHANNEL; kind: 'response'; id: number; ok: false; error: string };

export type BridgeStatus = {
  channel: typeof CHANNEL;
  kind: 'status';
  connected: boolean;
  version: number | null;
  reason?: 'missing' | 'unsupported-version';
  host?: string;
};

export type BridgeHello = { channel: typeof CHANNEL; kind: 'hello' };

export type DockPosition = 'bottom' | 'right' | 'window';

export type BridgeDock = { channel: typeof CHANNEL; kind: 'dock'; position: DockPosition };

export type BridgeEvent = { channel: typeof CHANNEL; kind: 'event'; event: { type: string; payload?: unknown } };

export type BridgeMessage = BridgeHello | BridgeDock | BridgeRequest | BridgeResponse | BridgeStatus | BridgeEvent;

export const READ_METHODS = [
  'isEnabled',
  'getTree',
  'inspect',
  'getServices',
  'getCounters',
  'getWarnings',
  'getErrors',
  'getRoutes',
  'getRoute',
  'getNavigations',
  'getStores',
  'getExtensions',
  'readExtension',
  'readValue',
] as const;

export const WRITE_METHODS = [
  'setClass',
  'setAttribute',
  'setVisible',
  'writeModel',
  'setProp',
  'navigate',
  'setStoreValue',
] as const;

export const PAGE_METHODS = ['highlight', 'pick'] as const;

export type BridgeMethod = (typeof READ_METHODS)[number] | (typeof WRITE_METHODS)[number] | (typeof PAGE_METHODS)[number];

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return typeof value === 'object' && value !== null && (value as { channel?: unknown }).channel === CHANNEL;
}
