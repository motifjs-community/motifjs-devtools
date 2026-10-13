import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';
import { routeRows } from './RouterModel';

export type HomeLink = { id: string; title: string; note: string; href: string; icon: string };

export const REPO = 'https://github.com/motifjsdev/motifjs';
export const DEVTOOLS_REPO = 'https://github.com/motifjs-community/motifjs-devtools';

export const LINKS: HomeLink[] = [
  { id: 'source', title: 'Source code', note: 'motifjsdev/motifjs on GitHub', href: REPO, icon: 'code' },
  { id: 'devtools', title: 'DevTools source', note: 'motifjs-community/motifjs-devtools', href: DEVTOOLS_REPO, icon: 'code' },
  { id: 'docs', title: 'Documentation', note: 'Guides and API at motifjs.com', href: 'https://motifjs.com/', icon: 'book' },
  { id: 'bug', title: 'Report a bug', note: 'Open an issue on GitHub', href: `${REPO}/issues/new`, icon: 'bug' },
  { id: 'idea', title: 'Share an idea', note: 'Join the GitHub Discussions', href: `${REPO}/discussions`, icon: 'idea' },
  { id: 'releases', title: 'Release notes', note: 'What changed in each version', href: `${REPO}/releases`, icon: 'notes' },
  { id: 'npm', title: '@motifx/core on npm', note: 'Versions and install', href: 'https://www.npmjs.com/package/@motifx/core', icon: 'package' },
];

type Registration = { lifetime: string; created: boolean };

const RELOAD_EVENTS = new Set(['stores:changed', 'scopes:changed', 'service:created', 'service:disposed', 'route:navigation-end']);

export class HomeModel {
  readonly state = reactive({
    stores: null as number | null,
    services: null as number | null,
    routes: null as number | null,
  });

  private loading = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: Client,
    private readonly visible: () => boolean,
    private readonly delay = 300,
  ) {
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.load();
      }),
      client.onEvent((event) => {
        if (RELOAD_EVENTS.has(event.type) && this.visible()) this.schedule();
      }),
    );
  }

  async load() {
    const ticket = ++this.loading;
    try {
      const [stores, services, routes] = await Promise.all([
        this.client.request<unknown[]>('getStores'),
        this.client.request<Registration[]>('getServices'),
        this.client.request<unknown>('getRoutes'),
      ]);
      if (ticket !== this.loading) return;
      this.state.stores = Array.isArray(stores) ? stores.filter((s) => (s as { released?: boolean }).released !== true).length : 0;
      this.state.services = Array.isArray(services) ? services.length : 0;
      this.state.routes = routes === null || routes === undefined ? null : routeRows(routes).length;
    } catch {}
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    for (const off of this.offs) off();
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, this.delay);
  }
}
