import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';

export const OUTCOMES = ['done', 'skipped', 'cancelled', 'notFound', 'error'] as const;

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

  dispose() {
    for (const off of this.offs) off();
  }
}
