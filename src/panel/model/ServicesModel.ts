import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';
import { valueId, type ValueEntry, type ValueNode, type ValueSource } from '../ValueTree';

export type Lifetime = 'singleton' | 'scoped' | 'transient';
export type LifetimeFilter = Lifetime | 'all';

export type ServiceRegistration = { token: string; lifetime: string; created: boolean };
export type ScopeService = { token: string; lifetime: string; instance: unknown; creating?: boolean };
export type ScopeInfo = {
  id: number;
  kind: 'root' | 'navigation' | 'user';
  name: string | null;
  parent: number | null;
  current: boolean;
  pending: boolean;
  pins: number;
  services: ScopeService[];
  transients: unknown[];
};
export type ScopeRow = { id: number; depth: number };
export type ServiceSlot = { token: string; lifetime: string; created: boolean; creating: boolean; instance: unknown };
export type Activity = { key: number; at: number; type: 'created' | 'disposed'; token: string; lifetime: string; scope: number };

type ReadResult = { ok: boolean; value?: { value: unknown; entries: ValueEntry[]; total: number }; error?: string };
type ServiceEvent = { scope: number; token: string; lifetime: string };

const KEY_SEP = '\u0002';
const PATH_SEP = '\u0001';
const LOAD_DELAY = 200;
const ACTIVITY_LIMIT = 200;
const RELOAD_EVENTS = new Set(['scopes:changed', 'service:created', 'service:disposed', 'route:navigation-end']);

export const LIFETIMES: Lifetime[] = ['singleton', 'scoped', 'transient'];

export function scopeName(scope: ScopeInfo | undefined): string {
  if (scope === undefined) return 'scope';
  if (scope.kind === 'root' || scope.kind === 'navigation') return scope.kind;
  return scope.name ?? 'scope';
}

export function scopeLabel(scope: ScopeInfo | undefined, id?: number): string {
  if (scope?.kind === 'root') return 'root';
  return `${scopeName(scope)} #${scope?.id ?? id ?? '?'}`;
}

export function scopeTag(scope: ScopeInfo | undefined): string {
  if (scope === undefined) return '';
  if (scope.current) return 'current';
  if (scope.pending) return 'pending';
  if (scope.kind === 'navigation') return scope.pins > 0 ? `kept by ${scope.pins}` : 'leaving';
  if (scope.kind === 'user') return 'user';
  return '';
}

export function scopeRows(scopes: ScopeInfo[]): ScopeRow[] {
  const ids = new Set(scopes.map((s) => s.id));
  const children = new Map<number | null, ScopeInfo[]>();
  for (const s of scopes) {
    const parent = s.parent !== null && ids.has(s.parent) ? s.parent : null;
    const list = children.get(parent);
    if (list === undefined) children.set(parent, [s]);
    else list.push(s);
  }
  const rows: ScopeRow[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const s of children.get(parent) ?? []) {
      rows.push({ id: s.id, depth });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export class ServicesModel {
  readonly state = reactive({
    registrations: [] as ServiceRegistration[],
    scopes: [] as ScopeInfo[],
    rows: [] as ScopeRow[],
    selected: null as number | null,
    pinned: false,
    filter: 'all' as LifetimeFilter,
    expanded: null as string | null,
    values: {} as Record<string, ValueNode>,
    activity: [] as Activity[],
    seen: {} as Record<number, string>,
    error: '',
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = 0;
  private seq = 0;
  private readonly offs: (() => void)[] = [];
  private readonly sources = new Map<string, ValueSource>();

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
        if (event.type === 'service:created' || event.type === 'service:disposed') this.record(event.type, event.payload as ServiceEvent | undefined);
        if (!this.visible()) return;
        if (RELOAD_EVENTS.has(event.type) || (event.type === 'reactivity:flush' && this.state.expanded !== null)) this.schedule();
      }),
    );
  }

  scope(id: number | null): ScopeInfo | undefined {
    return id === null ? undefined : this.state.scopes.find((s) => s.id === id);
  }

  labelOf(id: number) {
    const scope = this.scope(id);
    return scope !== undefined ? scopeLabel(scope) : (this.state.seen[id] ?? `scope #${id}`);
  }

  get root() {
    return this.state.scopes.find((s) => s.kind === 'root');
  }

  get current() {
    return this.state.scopes.find((s) => s.current) ?? this.root;
  }

  get selectedScope() {
    return this.scope(this.state.selected);
  }

  lifetimeOf(token: string) {
    return this.state.registrations.find((r) => r.token === token)?.lifetime ?? '';
  }

  slots(id: number | null): ServiceSlot[] {
    const scope = this.scope(id);
    if (scope === undefined) return [];
    const slots: ServiceSlot[] = scope.services.map((s) => ({ token: s.token, lifetime: s.lifetime, created: s.creating !== true, creating: s.creating === true, instance: s.instance }));
    const shown = new Set(slots.map((s) => s.token));
    const missing = scope.kind === 'root' ? 'singleton' : 'scoped';
    for (const r of this.state.registrations) {
      if (r.lifetime === missing && !shown.has(r.token)) slots.push({ token: r.token, lifetime: r.lifetime, created: false, creating: false, instance: null });
    }
    return slots;
  }

  activeScopes(token: string) {
    return this.state.scopes.filter((s) => s.services.some((x) => x.token === token && x.creating !== true)).length;
  }

  statusOf(registration: ServiceRegistration) {
    if (registration.lifetime === 'transient') return 'created on every request';
    const count = this.activeScopes(registration.token);
    if (count === 0) return 'not requested yet';
    if (registration.lifetime === 'singleton') return 'active';
    return count === 1 ? 'active in 1 scope' : `active in ${count} scopes`;
  }

  isActive(registration: ServiceRegistration) {
    return registration.lifetime !== 'transient' && this.activeScopes(registration.token) > 0;
  }

  get activeCount() {
    return this.state.registrations.filter((r) => this.isActive(r)).length;
  }

  shows(registration: ServiceRegistration | undefined) {
    if (registration === undefined) return false;
    return this.state.filter === 'all' || this.state.filter === registration.lifetime;
  }

  async load() {
    const ticket = ++this.loading;
    try {
      const [registrations, scopes] = await Promise.all([this.client.request<ServiceRegistration[]>('getServices'), this.client.request<ScopeInfo[]>('getScopes')]);
      if (ticket !== this.loading) return;
      this.state.registrations = Array.isArray(registrations) ? registrations : [];
      this.state.scopes = Array.isArray(scopes) ? scopes : [];
      this.state.rows = scopeRows(this.state.scopes);
      for (const s of this.state.scopes) if (this.state.seen[s.id] === undefined) this.state.seen[s.id] = scopeLabel(s);
      if (!this.state.pinned || this.scope(this.state.selected) === undefined) {
        this.state.pinned = false;
        this.state.selected = this.current?.id ?? null;
      }
      const open = this.state.expanded;
      if (open !== null) {
        const [scope, token] = open.split(KEY_SEP);
        if (this.slots(Number(scope)).some((s) => s.token === token && s.created)) await this.reloadValues(Number(scope), token);
        else this.state.expanded = null;
      }
    } catch {}
  }

  select(id: number) {
    if (this.state.selected === id) return;
    this.state.selected = id;
    this.state.pinned = id !== this.current?.id;
    this.state.expanded = null;
    this.state.values = {};
    this.state.error = '';
  }

  setFilter(filter: LifetimeFilter) {
    this.state.filter = filter;
  }

  clearActivity() {
    this.state.activity = [];
  }

  async toggle(scope: number, token: string) {
    const key = this.slotKey(scope, token);
    if (this.state.expanded === key) {
      this.state.expanded = null;
      return;
    }
    this.state.expanded = key;
    this.state.values = {};
    this.state.error = '';
    await this.read(scope, token, []);
  }

  slotKey(scope: number, token: string) {
    return `${scope}${KEY_SEP}${token}`;
  }

  sourceOf(scope: number, token: string): ValueSource {
    const id = this.slotKey(scope, token);
    let source = this.sources.get(id);
    if (source === undefined) {
      source = {
        node: (keys) => this.state.values[this.valueKey(scope, token, keys)],
        toggle: (keys) => void this.toggleValue(scope, token, keys),
      };
      this.sources.set(id, source);
    }
    return source;
  }

  node(scope: number, token: string) {
    return this.state.values[this.valueKey(scope, token, [])];
  }

  async toggleValue(scope: number, token: string, keys: string[]) {
    const key = this.valueKey(scope, token, keys);
    if (this.state.values[key] !== undefined) {
      for (const k of Object.keys(this.state.values)) if (k === key || k.startsWith(key + PATH_SEP)) delete this.state.values[k];
      return;
    }
    await this.read(scope, token, keys);
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    for (const off of this.offs) off();
  }

  private valueKey(scope: number, token: string, keys: string[]) {
    const base = this.slotKey(scope, token);
    return keys.length === 0 ? base : `${base}${KEY_SEP}${valueId(keys)}`;
  }

  private async read(scope: number, token: string, keys: string[]) {
    const key = this.valueKey(scope, token, keys);
    try {
      const result = await this.client.request<ReadResult>('readService', scope, token, keys);
      this.state.values[key] = result.ok && result.value ? { entries: result.value.entries, total: result.value.total } : { error: result.error ?? 'failed' };
    } catch (error) {
      this.state.values[key] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async reloadValues(scope: number, token: string) {
    const prefix = `${this.slotKey(scope, token)}${KEY_SEP}`;
    const open = Object.keys(this.state.values)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length).split(PATH_SEP));
    await this.read(scope, token, []);
    for (const keys of open) await this.read(scope, token, keys);
  }

  private record(type: string, payload: ServiceEvent | undefined) {
    if (payload === undefined || typeof payload.token !== 'string') return;
    const entry: Activity = {
      key: ++this.seq,
      at: this.time(),
      type: type === 'service:created' ? 'created' : 'disposed',
      token: payload.token,
      lifetime: payload.lifetime,
      scope: payload.scope,
    };
    this.state.activity = [entry, ...this.state.activity].slice(0, ACTIVITY_LIMIT);
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, this.delay);
  }
}
