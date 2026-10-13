import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';
import { MARK } from '../../bridge/serialize';

export const OUTCOMES = ['done', 'skipped', 'cancelled', 'notFound', 'error'] as const;
export const HOOKS = ['validate', 'onEntering', 'onEnter', 'onLeave', 'onUpdate', 'onShow'] as const;

export type RouterTab = 'current' | 'routes';

export type RouteRow = {
  key: string;
  depth: number;
  path: string;
  fullPath: string;
  name: string | null;
  control: string | null;
  redirect: string | null;
  alias: string[];
  keepAlive: boolean;
  hooks: string[];
  meta: unknown;
  extend: unknown;
  childCount: number;
};

type RawRoute = Record<string, unknown>;

const functionName = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return record[MARK] === 'function' ? (typeof record.name === 'string' && record.name !== '' ? record.name : 'anonymous') : null;
};

const controlOf = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const fn = functionName(value);
  if (fn !== null) return fn;
  if (typeof value === 'string') return value;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' ? record.type : 'value';
};

const redirectOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  const fn = functionName(value);
  return fn === null ? null : `ƒ ${fn}()`;
};

const join = (base: string, path: string) => {
  if (path.startsWith('/') && base === '') return path;
  const left = base.endsWith('/') ? base.slice(0, -1) : base;
  const right = path.startsWith('/') ? path : `/${path}`;
  return right === '/' ? left || '/' : `${left}${right}`;
};

export function routeRows(routes: unknown): RouteRow[] {
  const rows: RouteRow[] = [];
  const walk = (list: unknown, depth: number, base: string, prefix: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((item: RawRoute, index) => {
      if (typeof item !== 'object' || item === null) return;
      const path = typeof item.path === 'string' ? item.path : '';
      const fullPath = typeof item.fullPath === 'string' ? item.fullPath : join(base, path);
      const key = `${prefix}${index}`;
      const alias = typeof item.alias === 'string' ? [item.alias] : Array.isArray(item.alias) ? item.alias.filter((a): a is string => typeof a === 'string') : [];
      rows.push({
        key,
        depth,
        path,
        fullPath,
        name: typeof item.name === 'string' ? item.name : null,
        control: controlOf(item.control),
        redirect: redirectOf(item.redirect),
        alias,
        keepAlive: item.keepAlive === true,
        hooks: HOOKS.filter((hook) => functionName(item[hook]) !== null),
        meta: item.meta,
        extend: item.extend,
        childCount: Array.isArray(item.childs) ? item.childs.length : 0,
      });
      walk(item.childs, depth + 1, fullPath, `${key}.`);
    });
  };
  walk(routes, 0, '', '');
  return rows;
}

export function matchesRoute(pattern: string, uri: string): boolean {
  const parts = (value: string) => value.split('?')[0].split('/').filter(Boolean);
  const want = parts(pattern);
  const have = parts(uri);
  if (want.length !== have.length) return false;
  return want.every((segment, i) => (segment.startsWith('{') && segment.endsWith('}')) || segment.startsWith(':') || segment === '*' || segment === have[i]);
}

export type Outcome = (typeof OUTCOMES)[number];
export type OutcomeFilter = Outcome | 'all';

export type CurrentRoute = { uri: string; params: unknown; chain: string[] };

export type Navigation = {
  key: string;
  requested: string;
  uri: string | null;
  outcome: string;
  reason?: string;
  params?: unknown;
  duration: number;
  at: number;
};

type RawNavigation = Omit<Navigation, 'key'>;

export class RouterModel {
  readonly state = reactive({
    hasRouter: false,
    route: null as CurrentRoute | null,
    navigations: [] as Navigation[],
    navigating: null as string | null,
    filter: 'all' as OutcomeFilter,
    expanded: null as string | null,
    tab: 'current' as RouterTab,
    routes: [] as RouteRow[],
    openRoute: null as string | null,
  });

  private loading = 0;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly client: Client) {
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.load();
        else this.state.navigating = null;
      }),
      client.onEvent((event) => {
        if (event.type === 'route:navigation-start') {
          const uri = (event.payload as { uri?: unknown } | undefined)?.uri;
          this.state.navigating = typeof uri === 'string' ? uri : '';
        } else if (event.type === 'route:navigation-end') {
          this.state.navigating = null;
          void this.load();
        }
      }),
    );
  }

  get visible() {
    const filter = this.state.filter;
    return filter === 'all' ? this.state.navigations : this.state.navigations.filter((n) => n.outcome === filter);
  }

  async load() {
    const ticket = ++this.loading;
    try {
      const [routes, route, navigations] = await Promise.all([
        this.client.request<unknown>('getRoutes'),
        this.client.request<CurrentRoute | null>('getRoute'),
        this.client.request<RawNavigation[]>('getNavigations'),
      ]);
      if (ticket !== this.loading) return;
      this.state.hasRouter = routes !== null && routes !== undefined;
      this.state.routes = routeRows(routes);
      this.state.route = route ?? null;
      this.state.navigations = (Array.isArray(navigations) ? navigations : []).map((n) => ({ ...n, key: `${n.at}|${n.duration}|${n.requested}` })).reverse();
    } catch {}
  }

  setFilter(filter: OutcomeFilter) {
    this.state.filter = filter;
  }

  toggle(key: string) {
    this.state.expanded = this.state.expanded === key ? null : key;
  }

  setTab(tab: RouterTab) {
    this.state.tab = tab;
  }

  toggleRoute(key: string) {
    this.state.openRoute = this.state.openRoute === key ? null : key;
  }

  row(key: string) {
    return this.state.routes.find((r) => r.key === key);
  }

  isActive(row: RouteRow | undefined) {
    const chain = this.state.route?.chain ?? [];
    return row !== undefined && row.redirect === null && row.depth < chain.length && matchesRoute(row.fullPath, chain[row.depth]);
  }

  isCurrent(row: RouteRow | undefined) {
    const chain = this.state.route?.chain ?? [];
    return row !== undefined && row.depth === chain.length - 1 && this.isActive(row);
  }

  dispose() {
    for (const off of this.offs) off();
  }
}
