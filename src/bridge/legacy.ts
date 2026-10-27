type Listener = (event: { type: string; payload?: unknown }) => void;

export type ContractLike = {
  version: number;
  on(listener: Listener): () => void;
  [method: string]: unknown;
};

type TreeNodeLike = { path?: unknown; children?: unknown; [key: string]: unknown };

const SHELL = 0;

const isPath = (value: unknown): value is number[] => Array.isArray(value) && value.every((n) => Number.isInteger(n));

const under = (path: unknown): number[] | null => (isPath(path) && path.length > 0 && path[0] === SHELL ? path.slice(1) : null);

const above = (path: unknown): unknown => (isPath(path) ? [SHELL, ...path] : path);

const liftTree = (node: unknown): unknown => {
  if (typeof node !== 'object' || node === null) return node;
  const out: TreeNodeLike = { ...(node as TreeNodeLike) };
  out.path = above(out.path);
  if (Array.isArray(out.children)) out.children = out.children.map(liftTree);
  return out;
};

const liftPreviews = (value: unknown, depth = 8): unknown => {
  if (depth <= 0 || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => liftPreviews(item, depth - 1));
  const record = value as Record<string, unknown>;
  if (record.kind === 'component' && isPath(record.path)) return { ...record, path: above(record.path) };
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) out[key] = liftPreviews(item, depth - 1);
  return out;
};

const liftResult = (result: unknown): unknown => {
  if (typeof result !== 'object' || result === null) return result;
  const record = result as Record<string, unknown>;
  return record.ok === true ? { ...record, value: liftPreviews(record.value) } : result;
};

const liftEvent = (event: { type: string; payload?: unknown }): { type: string; payload?: unknown } => {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (typeof payload !== 'object' || payload === null) return event;
  if (event.type === 'tree:changed' && Array.isArray(payload.parents)) return { type: event.type, payload: { ...payload, parents: payload.parents.map(above) } };
  if (event.type.startsWith('component:') && isPath(payload.path)) return { type: event.type, payload: { ...payload, path: above(payload.path) } };
  if (event.type === 'reactivity:flush' && Array.isArray(payload.effects)) {
    return { type: event.type, payload: { ...payload, effects: payload.effects.map((effect) => (typeof effect === 'object' && effect !== null && isPath((effect as { path?: unknown }).path) ? { ...(effect as object), path: above((effect as { path: unknown }).path) } : effect)) } };
  }
  return event;
};

const noComponent = { ok: false, error: 'no component at path' };

export function adaptLegacy(core: ContractLike): ContractLike {
  const call = <T>(name: string, ...args: unknown[]): T => (core[name] as (...a: unknown[]) => T).apply(core, args);
  const has = (name: string) => typeof core[name] === 'function';
  const forest = (depth: number) => {
    const shell = call<TreeNodeLike | null>('getTree', [], depth > 0 ? depth - 1 : 0);
    if (shell === null) return null;
    const out: TreeNodeLike = { path: [], type: 'Application', tag: '#roots', built: true, visible: true, waiting: false, disposed: false, connected: true, document: 0, childCount: 1 };
    if (depth > 0) out.children = [liftTree(shell)];
    return out;
  };
  const withPath = (name: string, missing: unknown) => (path: unknown, ...rest: unknown[]) => {
    const inner = under(path);
    return inner === null ? missing : liftResult(call(name, inner, ...rest));
  };
  const adapted: ContractLike = {
    version: core.version,
    on: (listener: Listener) => core.on((event) => listener(liftEvent(event))),
    getTree: (path: unknown = [], depth: unknown = Infinity) => {
      const levels = typeof depth === 'number' ? depth : Infinity;
      if (isPath(path) && path.length === 0) return forest(levels);
      const inner = under(path);
      return inner === null ? null : liftTree(call('getTree', inner, levels));
    },
    getElement: (path: unknown) => {
      const inner = under(path);
      return inner === null ? null : call('getElement', inner);
    },
    pathOfElement: (node: unknown) => above(call('pathOfElement', node)),
    getDocuments: () => (has('getDocuments') ? call('getDocuments') : typeof document === 'undefined' ? [] : [document]),
    inspect: (path: unknown) => {
      const inner = under(path);
      if (inner === null) return null;
      const result = call<Record<string, unknown> | null>('inspect', inner);
      return result === null ? null : { ...(liftPreviews(result) as Record<string, unknown>), path: above(result.path) };
    },
    readValue: withPath('readValue', noComponent),
    readStore: (...args: unknown[]) => liftResult(call('readStore', ...args)),
    readService: (...args: unknown[]) => liftResult(call('readService', ...args)),
    getStores: () => {
      const stores = call<unknown>('getStores');
      return Array.isArray(stores) ? stores.map((store) => (typeof store === 'object' && store !== null ? { ...(store as object), holders: liftPreviews((store as { holders?: unknown }).holders) } : store)) : stores;
    },
    getScopes: () => liftPreviews(call('getScopes')),
    setClass: withPath('setClass', noComponent),
    setAttribute: withPath('setAttribute', noComponent),
    setVisible: withPath('setVisible', Promise.resolve(noComponent)),
    writeModel: withPath('writeModel', noComponent),
    setProp: withPath('setProp', noComponent),
  };
  for (const [name, value] of Object.entries(core)) if (!(name in adapted)) adapted[name] = typeof value === 'function' ? (...args: unknown[]) => call(name, ...args) : value;
  return adapted;
}
