import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';
import { MARK } from '../../bridge/serialize';
import { formatValue } from '../format';
import { valueId, type ValueEntry, type ValueNode, type ValueSource } from '../ValueTree';

export type StoreType = 'reactive' | 'signal' | 'computed';
export type StoreTypeFilter = StoreType | 'all';

export type StoreHolder =
  | { kind: 'component'; path: number[]; type: string; field: string }
  | { kind: 'service'; token: string; lifetime: string; field: string | null };

export type StoreItem = { id: number; name: string; type: StoreType; value: unknown; stale?: boolean; released?: boolean; holders: StoreHolder[] };

export type StoreChange = { path: string[]; key: string; at: number };

type ReadResult = { ok: boolean; value?: { value: unknown; entries: ValueEntry[]; total: number }; error?: string };
type FlushTrigger = { key: string; store?: { id: number; path: string[] } };

export const holderName = (holder: StoreHolder) =>
  holder.kind === 'component' ? `${holder.type}.${holder.field}` : holder.field === null ? holder.token : `${holder.token}.${holder.field}`;

export const displayName = (item: StoreItem) => (item.holders.length > 0 ? holderName(item.holders[0]) : item.name);

export function summaryOf(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value !== null && typeof value === 'object' && typeof (value as Record<string, unknown>)[MARK] !== 'string' && typeof (value as { kind?: unknown }).kind !== 'string') {
    return `${Object.keys(value).length} keys`;
  }
  return formatValue(value).text;
}

const KEY_SEP = '\u0002';
const PATH_SEP = '\u0001';
const LOAD_DELAY = 300;
const RELOAD_EVENTS = new Set(['stores:changed', 'tree:changed', 'component:disposed']);

export class StoresModel {
  readonly state = reactive({
    stores: [] as StoreItem[],
    filter: 'all' as StoreTypeFilter,
    showReleased: false,
    expanded: null as number | null,
    values: {} as Record<string, ValueNode>,
    roots: {} as Record<number, unknown>,
    changes: {} as Record<number, StoreChange>,
    editing: null as string | null,
    error: '',
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = 0;
  private readonly offs: (() => void)[] = [];
  private readonly sources = new Map<number, ValueSource>();

  constructor(
    private readonly client: Client,
    private readonly visible: () => boolean,
    private readonly delay = LOAD_DELAY,
    private readonly time: () => number = Date.now,
  ) {
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.load();
      }),
      client.onEvent((event) => {
        if (RELOAD_EVENTS.has(event.type)) {
          if (this.visible()) this.schedule();
          return;
        }
        if (event.type !== 'reactivity:flush') return;
        const triggers = ((event.payload as { triggers?: FlushTrigger[] } | undefined)?.triggers ?? []).filter((t) => t.store !== undefined);
        if (triggers.length === 0) return;
        const at = this.time();
        let unknown = false;
        for (const t of triggers) {
          this.state.changes[t.store!.id] = { path: t.store!.path, key: t.key, at };
          if (!this.state.stores.some((s) => s.id === t.store!.id)) unknown = true;
        }
        if (unknown || this.visible()) this.schedule();
      }),
    );
  }

  get liveStores() {
    return this.state.stores.filter((s) => s.released !== true);
  }

  get releasedCount() {
    return this.state.stores.length - this.liveStores.length;
  }

  get visibleStores() {
    return this.state.stores.filter((s) => this.shows(s));
  }

  shows(item: StoreItem | undefined) {
    if (item === undefined) return false;
    if (item.released === true && !this.state.showReleased) return false;
    return this.state.filter === 'all' || this.state.filter === item.type;
  }

  toggleReleased() {
    this.state.showReleased = !this.state.showReleased;
  }

  nameOf(id: number): string | null {
    const item = this.state.stores.find((s) => s.id === id);
    return item === undefined ? null : displayName(item);
  }

  async load() {
    const ticket = ++this.loading;
    try {
      const stores = await this.client.request<StoreItem[]>('getStores');
      if (ticket !== this.loading) return;
      this.state.stores = Array.isArray(stores) ? stores : [];
      const open = this.state.expanded;
      if (open !== null && this.state.stores.some((s) => s.id === open)) await this.reloadValues(open);
    } catch {}
  }

  setFilter(filter: StoreTypeFilter) {
    this.state.filter = filter;
  }

  async toggle(id: number) {
    if (this.state.expanded === id) {
      this.state.expanded = null;
      return;
    }
    this.state.expanded = id;
    this.state.values = {};
    this.state.error = '';
    this.state.editing = null;
    await this.read(id, []);
  }

  sourceOf(id: number): ValueSource {
    let source = this.sources.get(id);
    if (source === undefined) {
      source = {
        node: (keys) => this.state.values[this.key(id, keys)],
        toggle: (keys) => void this.toggleValue(id, keys),
        editing: (keys) => this.state.editing === this.key(id, keys),
        startEdit: (keys) => {
          this.state.error = '';
          this.state.editing = this.key(id, keys);
        },
        cancelEdit: () => {
          this.state.editing = null;
        },
        commitEdit: (keys, text, original) => void this.commitEdit(id, keys, text, original),
      };
      this.sources.set(id, source);
    }
    return source;
  }

  async toggleValue(id: number, keys: string[]) {
    const key = this.key(id, keys);
    if (this.state.values[key] !== undefined) {
      for (const k of Object.keys(this.state.values)) if (k === key || k.startsWith(key + PATH_SEP)) delete this.state.values[k];
      return;
    }
    await this.read(id, keys);
  }

  async commitEdit(id: number, keys: string[], text: string, original: unknown) {
    const parsed = parseEdit(text, original);
    this.state.editing = null;
    if ('error' in parsed) {
      this.state.error = parsed.error;
      return;
    }
    try {
      const result = await this.client.request<{ ok: boolean; error?: string }>('setStoreValue', id, keys, parsed.value);
      this.state.error = result.ok ? '' : (result.error ?? 'failed');
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    }
    await this.load();
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    for (const off of this.offs) off();
  }

  private key(id: number, keys: string[]) {
    return keys.length === 0 ? `${id}` : `${id}${KEY_SEP}${valueId(keys)}`;
  }

  private async read(id: number, keys: string[]) {
    try {
      const result = await this.client.request<ReadResult>('readStore', id, keys);
      if (keys.length === 0) this.state.roots[id] = result.ok && result.value ? result.value.value : undefined;
      this.state.values[this.key(id, keys)] = result.ok && result.value ? { entries: result.value.entries, total: result.value.total } : { error: result.error ?? 'failed' };
    } catch (error) {
      this.state.values[this.key(id, keys)] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async reloadValues(id: number) {
    const prefix = `${id}${KEY_SEP}`;
    const open = Object.keys(this.state.values)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length).split(PATH_SEP));
    await this.read(id, []);
    for (const keys of open) await this.read(id, keys);
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, this.delay);
  }
}

export function parseEdit(text: string, original: unknown): { value: unknown } | { error: string } {
  if (typeof original === 'number') {
    const n = Number(text.trim());
    return text.trim() === '' || Number.isNaN(n) ? { error: 'Not a number' } : { value: n };
  }
  if (typeof original === 'boolean') {
    const t = text.trim();
    return t === 'true' ? { value: true } : t === 'false' ? { value: false } : { error: 'Not true or false' };
  }
  if (typeof original === 'string') return { value: text };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: text };
  }
}
