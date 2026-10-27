export const CHANNEL = 'motif-devtools';
export const CONTRACT_VERSION = 2;
export const SUPPORTED_VERSIONS: readonly number[] = [1, 2];

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
  coreVersion?: string;
};

export type BridgeHello = { channel: typeof CHANNEL; kind: 'hello' };

export type DockPosition = 'bottom' | 'right' | 'window';

export type BridgeDock = { channel: typeof CHANNEL; kind: 'dock'; position: DockPosition };

export type BridgeEventData = { type: string; payload?: unknown; time?: number };

export type BridgeEvents = { channel: typeof CHANNEL; kind: 'events'; events: BridgeEventData[] };

export type BridgeChunk = { channel: typeof CHANNEL; kind: 'chunk'; id: number; value: unknown };

export type BridgeCancel = { channel: typeof CHANNEL; kind: 'cancel'; id: number };

export type BridgeVisibility = { channel: typeof CHANNEL; kind: 'visibility'; shown: boolean };

export type PageMemory = { used: number; total: number; limit: number };

export type TreeRecord = [depth: number, index: number, type: string, tag: string, flags: number, childCount: number, document: number, title?: string];

export const TREE_FLAGS = { built: 1, visible: 2, waiting: 4, disposed: 8, connected: 16 } as const;

export type BridgeMessage = BridgeHello | BridgeDock | BridgeRequest | BridgeResponse | BridgeStatus | BridgeEvents | BridgeChunk | BridgeCancel | BridgeVisibility;

export const READ_METHODS = [
  'isEnabled',
  'getTree',
  'getDocuments',
  'inspect',
  'getServices',
  'getScopes',
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
  'readStore',
  'readService',
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

export const PAGE_METHODS = ['highlight', 'pick', 'getMemory', 'readTree'] as const;

export type BridgeMethod = (typeof READ_METHODS)[number] | (typeof WRITE_METHODS)[number] | (typeof PAGE_METHODS)[number];

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return typeof value === 'object' && value !== null && (value as { channel?: unknown }).channel === CHANNEL;
}
