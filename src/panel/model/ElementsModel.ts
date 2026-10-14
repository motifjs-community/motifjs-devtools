import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';
import { pathKey } from '../format';
import { valueId, type ValueEntry, type ValueNode, type ValueSource } from '../ValueTree';

export type TreeNode = {
  path: number[];
  type: string;
  tag: string;
  built: boolean;
  visible: boolean;
  waiting: boolean;
  disposed: boolean;
  connected: boolean;
  childCount: number;
  children?: TreeNode[];
};

export type Row = {
  key: string;
  path: number[];
  depth: number;
  type: string;
  tag: string;
  named: boolean;
  visible: boolean;
  waiting: boolean;
  connected: boolean;
  hasChildren: boolean;
  expanded: boolean;
};

export type Inspection = Omit<TreeNode, 'children'> & {
  props: Record<string, unknown>;
  fields?: Record<string, unknown>;
  functionProps?: Record<string, unknown>;
  bindings: { kind: string; property?: string; member?: unknown; updateMode?: unknown; active: boolean | null }[];
  events: { name: string; type?: string; dom: boolean; handler?: unknown; modifiers?: string[] }[];
  hooks: { name: string; method: boolean; handlers: number }[];
  classes: { static: string[]; reactive: { id: string; classes: string[] }[] };
  attributes: { name?: string; key?: string; [key: string]: unknown }[];
  services: { scope: { kind: string; name: string | null } | null; requested: string[] } | null;
  effects: { kind: string; runs: number; lastDuration: number; lastTrigger: unknown; deps: unknown[] }[];
  extensions: Record<string, unknown>;
};

export type ValueOrigin = 'props' | 'functionProps' | 'fields';

const valueKey = (origin: ValueOrigin, keys: readonly string[]) => origin + '' + valueId(keys);

const PLAIN_TYPES = new Set(['Component', 'FragmentNode']);
const AUTO_EXPAND_ROWS = 400;
const TREE_EVENTS = new Set(['tree:changed', 'component:built', 'component:visibility', 'component:wait', 'component:disposed']);
const REFRESH_DELAY = 120;

export const isNamed = (type: string) => !PLAIN_TYPES.has(type);

export class ElementsModel {
  readonly state = reactive({
    rows: [] as Row[],
    total: 0,
    connected: 0,
    detached: 0,
    hidePlain: false,
    query: '',
    selected: null as string | null,
    inspection: null as Inspection | null,
    tab: 'details' as 'details' | 'effects' | 'extensions',
    error: null as string | null,
    revealed: 0,
    values: {} as Record<string, ValueNode>,
  });

  private tree: TreeNode | null = null;
  private readonly expanded = new Set<string>();
  private readonly collapsed = new Set<string>();
  private readonly rowCache = new Map<string, Row>();
  private treeTimer: ReturnType<typeof setTimeout> | null = null;
  private inspectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: (() => void)[] = [];
  private hovered: string | null = null;
  private treeTicket = 0;

  constructor(private readonly client: Client) {
    this.offs.push(
      client.onEvent((event) => {
        if (event.type === 'devtools:picked') void this.reveal((event.payload as { path: number[] }).path);
        else if (TREE_EVENTS.has(event.type)) this.scheduleTree();
        else if (event.type === 'reactivity:flush') this.scheduleInspect();
      }),
      client.onStatus((status) => {
        if (status.connected) void this.loadTree();
      }),
    );
    void this.loadTree();
  }

  async loadTree() {
    const ticket = ++this.treeTicket;
    try {
      const tree = await this.client.request<TreeNode | null>('getTree');
      if (ticket !== this.treeTicket) return;
      this.tree = tree;
      this.state.error = null;
    } catch (error) {
      if (ticket === this.treeTicket) this.state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    this.rebuildRows();
    if (this.state.selected !== null) void this.inspectSelected();
  }

  toggle(row: Row) {
    if (!row.hasChildren) return;
    if (row.expanded) {
      this.expanded.delete(row.key);
      this.collapsed.add(row.key);
    } else {
      this.collapsed.delete(row.key);
      this.expanded.add(row.key);
    }
    this.rebuildRows();
  }

  setHidePlain(value: boolean) {
    this.state.hidePlain = value;
    this.rebuildRows();
  }

  setQuery(value: string) {
    this.state.query = value;
    this.rebuildRows();
  }

  readonly propsSource: ValueSource = {
    node: (keys) => this.state.values[valueKey(this.propsOrigin(), keys)],
    toggle: (keys) => void this.toggleValue(keys),
  };

  readonly fieldsSource: ValueSource = {
    node: (keys) => this.state.values[valueKey('fields', keys)],
    toggle: (keys) => void this.toggleValue(keys, 'fields'),
  };

  async toggleValue(keys: string[], origin: ValueOrigin = this.propsOrigin()) {
    const id = valueKey(origin, keys);
    if (this.state.values[id] !== undefined) {
      for (const key of Object.keys(this.state.values)) if (key === id || key.startsWith(id + '')) delete this.state.values[key];
      return;
    }
    await this.loadValue(origin, keys);
  }

  private propsOrigin(): ValueOrigin {
    return this.state.inspection?.functionProps ? 'functionProps' : 'props';
  }

  private async loadValue(origin: ValueOrigin, keys: string[]) {
    const path = this.selectedPath();
    if (path === null) return;
    const id = valueKey(origin, keys);
    try {
      const result = await this.client.request<{ ok: boolean; value?: { entries: ValueEntry[]; total: number }; error?: string }>('readValue', path, origin, keys);
      this.state.values[id] = result.ok && result.value ? { entries: result.value.entries, total: result.value.total } : { error: result.error ?? 'failed' };
    } catch (error) {
      this.state.values[id] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  select(row: Row) {
    if (this.state.selected !== row.key) this.state.values = {};
    this.state.selected = row.key;
    this.state.tab = 'details';
    void this.inspectSelected();
  }

  hover(row: Row | null) {
    const key = row?.key ?? null;
    if (key === this.hovered) return;
    this.hovered = key;
    void this.client.request('highlight', row === null ? null : [...row.path]).catch(() => {});
  }

  async reveal(path: number[]) {
    await this.loadTree();
    for (let i = 0; i < path.length; i++) {
      const key = pathKey(path.slice(0, i));
      this.collapsed.delete(key);
      this.expanded.add(key);
    }
    if (this.state.query !== '') this.state.query = '';
    this.rebuildRows();
    let target: Row | undefined;
    for (let n = path.length; n >= 0 && target === undefined; n--) {
      const key = pathKey(path.slice(0, n));
      target = this.state.rows.find((row) => row.key === key);
    }
    if (target === undefined) return;
    this.select(target);
    this.state.revealed++;
  }

  setTab(tab: 'details' | 'effects' | 'extensions') {
    this.state.tab = tab;
  }

  async setVisible(visible: boolean) {
    const path = this.selectedPath();
    if (path === null) return;
    await this.write('setVisible', path, visible);
  }

  async setClass(name: string, on: boolean) {
    const path = this.selectedPath();
    if (path === null || name.trim() === '') return;
    await this.write('setClass', path, name.trim(), on);
  }

  dispose() {
    if (this.treeTimer !== null) clearTimeout(this.treeTimer);
    if (this.inspectTimer !== null) clearTimeout(this.inspectTimer);
    for (const off of this.offs) off();
  }

  private async write(method: 'setVisible' | 'setClass', ...args: unknown[]) {
    try {
      const result = await this.client.request<{ ok: boolean; error?: string }>(method, ...args);
      this.state.error = result.ok ? null : result.error ?? 'failed';
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    }
    await this.inspectSelected();
  }

  private selectedPath(): number[] | null {
    const key = this.state.selected;
    if (key === null) return null;
    return key === '' ? [] : key.split('.').map(Number);
  }

  private async inspectSelected() {
    const path = this.selectedPath();
    if (path === null) {
      this.state.inspection = null;
      return;
    }
    try {
      this.state.inspection = await this.client.request<Inspection | null>('inspect', path);
    } catch {
      this.state.inspection = null;
    }
    const open = Object.keys(this.state.values).map((id) => id.split(''));
    for (const [origin, keys] of open) await this.loadValue(origin as ValueOrigin, keys.split(''));
  }

  private scheduleTree() {
    if (this.treeTimer !== null) return;
    this.treeTimer = setTimeout(() => {
      this.treeTimer = null;
      void this.loadTree();
    }, REFRESH_DELAY);
  }

  private scheduleInspect() {
    if (this.state.selected === null || this.inspectTimer !== null) return;
    this.inspectTimer = setTimeout(() => {
      this.inspectTimer = null;
      void this.inspectSelected();
    }, REFRESH_DELAY * 2);
  }

  private isExpanded(key: string, budget: { rows: number }) {
    if (this.expanded.has(key)) return true;
    if (this.collapsed.has(key)) return false;
    return budget.rows < AUTO_EXPAND_ROWS;
  }

  private rebuildRows() {
    const next: Row[] = [];
    const seen = new Set<string>();
    let total = 0;
    let connected = 0;
    const query = this.state.query.trim().toLowerCase();
    const budget = { rows: 0 };
    const matches = (node: TreeNode) => query === '' || node.type.toLowerCase().includes(query) || node.tag.toLowerCase().includes(query);

    const count = (node: TreeNode) => {
      total++;
      if (node.connected) connected++;
      for (const child of node.children ?? []) count(child);
    };

    const shown = (node: TreeNode) => (!this.state.hidePlain || isNamed(node.type) || node.path.length === 0) && matches(node);
    const memo = new Map<TreeNode, boolean>();
    const showsAny = (node: TreeNode): boolean => {
      let result = memo.get(node);
      if (result === undefined) {
        result = (node.children ?? []).some((child) => shown(child) || showsAny(child));
        memo.set(node, result);
      }
      return result;
    };

    const visit = (node: TreeNode, depth: number) => {
      const named = isNamed(node.type);
      const show = shown(node);
      const children = node.children ?? [];
      const key = pathKey(node.path);
      let expanded = true;
      if (show) {
        budget.rows++;
        const hasChildren = showsAny(node);
        expanded = hasChildren && (query !== '' || this.isExpanded(key, budget));
        next.push(this.rowFor(key, node, depth, named, hasChildren, expanded));
        seen.add(key);
      }
      if (!expanded && show) return;
      const childDepth = show ? depth + 1 : depth;
      for (const child of children) visit(child, childDepth);
    };

    if (this.tree !== null) {
      count(this.tree);
      visit(this.tree, 0);
    }
    for (const key of this.rowCache.keys()) if (!seen.has(key)) this.rowCache.delete(key);
    this.state.total = total;
    this.state.connected = connected;
    this.state.detached = total - connected;
    this.state.rows.splice(0, this.state.rows.length, ...next);
  }

  private rowFor(key: string, node: TreeNode, depth: number, named: boolean, hasChildren: boolean, expanded: boolean): Row {
    const existing = this.rowCache.get(key);
    const values = {
      key,
      path: node.path,
      depth,
      type: node.type,
      tag: node.tag,
      named,
      visible: node.visible,
      waiting: node.waiting,
      connected: node.connected,
      hasChildren,
      expanded,
    };
    if (existing !== undefined) {
      Object.assign(existing, values);
      return existing;
    }
    const row = reactive(values) as Row;
    this.rowCache.set(key, row);
    return row;
  }
}
