import { reactive } from '@motifx/core';
import { TREE_FLAGS, type TreeRecord } from '../../bridge/protocol';
import { taskRunner, type Cancel } from '../../bridge/schedule';
import type { Client, Stream } from '../../client/client';
import { pathKey } from '../format';
import { valueId, type ValueEntry, type ValueNode, type ValueSource } from '../ValueTree';
import { READ_GAP, Reader } from './reader';

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
export const ROWS_SLICE = 2000;

export const isNamed = (type: string) => !PLAIN_TYPES.has(type);

let runTask: ((run: () => void) => Cancel) | null = null;
const nextTask = () => new Promise<void>((resolve) => void (runTask ??= taskRunner())(resolve));

export function treeBuilder() {
  let root: TreeNode | null = null;
  const open: TreeNode[] = [];
  return {
    get root() {
      return root;
    },
    add(records: readonly TreeRecord[]) {
      for (const [depth, index, type, tag, flags, childCount] of records) {
        const parent = depth === 0 ? null : open[depth - 1];
        if (depth > 0 && parent === undefined) continue;
        const node: TreeNode = {
          path: parent === null ? [] : [...parent.path, index],
          type,
          tag,
          built: (flags & TREE_FLAGS.built) !== 0,
          visible: (flags & TREE_FLAGS.visible) !== 0,
          waiting: (flags & TREE_FLAGS.waiting) !== 0,
          disposed: (flags & TREE_FLAGS.disposed) !== 0,
          connected: (flags & TREE_FLAGS.connected) !== 0,
          childCount,
          children: [],
        };
        if (parent === null) root = node;
        else parent.children!.push(node);
        open.length = depth;
        open[depth] = node;
      }
    },
  };
}

export class ElementsModel {
  readonly state = reactive({
    rowCount: 0,
    rowsVersion: 0,
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

  rows: Row[] = [];

  private tree: TreeNode | null = null;
  private readonly expanded = new Set<string>();
  private readonly collapsed = new Set<string>();
  private readonly offs: (() => void)[] = [];
  private readonly treeReader: Reader;
  private readonly inspectReader: Reader;
  private stream: Stream<unknown> | null = null;
  private hovered: string | null = null;
  private rowsTicket = 0;

  constructor(
    private readonly client: Client,
    private readonly active: () => boolean = () => true,
    gap = READ_GAP,
  ) {
    this.treeReader = new Reader(() => this.readTree(), active, gap);
    this.inspectReader = new Reader(() => this.inspectSelected(), () => active() && this.state.selected !== null, gap);
    this.offs.push(
      client.onEvent((event) => {
        if (event.type === 'devtools:picked') void this.reveal((event.payload as { path: number[] }).path);
        else if (TREE_EVENTS.has(event.type)) void this.treeReader.request();
        else if (event.type === 'reactivity:flush') void this.inspectReader.request();
      }),
      client.onStatus((status) => {
        if (status.connected) void this.treeReader.request(true);
      }),
    );
    void this.treeReader.request(true);
  }

  loadTree() {
    return this.treeReader.request(true);
  }

  wake() {
    this.treeReader.wake();
    this.inspectReader.wake();
  }

  pause() {
    this.stream?.cancel();
  }

  private async readTree() {
    const builder = treeBuilder();
    const stream = this.client.stream<TreeRecord[]>('readTree', (records) => builder.add(records));
    this.stream = stream;
    try {
      await stream.done;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'cancelled') void this.treeReader.request();
      else this.state.error = message;
      return;
    } finally {
      if (this.stream === stream) this.stream = null;
    }
    this.tree = builder.root;
    this.state.error = null;
    await this.rebuildRows();
    if (this.state.selected !== null) void this.inspectReader.request(true);
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
    void this.rebuildRows();
  }

  setHidePlain(value: boolean) {
    this.state.hidePlain = value;
    void this.rebuildRows();
  }

  setQuery(value: string) {
    this.state.query = value;
    void this.rebuildRows();
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
    void this.inspectReader.request(true);
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
    await this.rebuildRows();
    let target: Row | undefined;
    for (let n = path.length; n >= 0 && target === undefined; n--) {
      const key = pathKey(path.slice(0, n));
      target = this.rows.find((row) => row.key === key);
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
    this.treeReader.dispose();
    this.inspectReader.dispose();
    this.stream?.cancel();
    this.rowsTicket++;
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

  private isExpanded(key: string, budget: { rows: number }) {
    if (this.expanded.has(key)) return true;
    if (this.collapsed.has(key)) return false;
    return budget.rows < AUTO_EXPAND_ROWS;
  }

  private async rebuildRows(): Promise<void> {
    const ticket = ++this.rowsTicket;
    const tree = this.tree;
    const next: Row[] = [];
    let total = 0;
    let connected = 0;
    let work = 0;
    const query = this.state.query.trim().toLowerCase();
    const hidePlain = this.state.hidePlain;
    const budget = { rows: 0 };
    const matches = (node: TreeNode) => query === '' || node.type.toLowerCase().includes(query) || node.tag.toLowerCase().includes(query);
    const shown = (node: TreeNode) => (!hidePlain || isNamed(node.type) || node.path.length === 0) && matches(node);
    const showsAny = new Map<TreeNode, boolean>();
    const current = () => ticket === this.rowsTicket && tree === this.tree;

    if (tree !== null) {
      const stack: [TreeNode, number][] = [[tree, 0]];
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const children = top[0].children ?? [];
        if (top[1] < children.length) {
          stack.push([children[top[1]++], 0]);
          continue;
        }
        stack.pop();
        total++;
        if (top[0].connected) connected++;
        showsAny.set(top[0], children.some((child) => shown(child) || showsAny.get(child) === true));
        if (++work % ROWS_SLICE === 0) {
          await nextTask();
          if (!current()) return;
        }
      }

      const visits: [TreeNode, number][] = [[tree, 0]];
      while (visits.length > 0) {
        const [node, depth] = visits.pop()!;
        const show = shown(node);
        const children = node.children ?? [];
        let expanded = true;
        if (show) {
          budget.rows++;
          const key = pathKey(node.path);
          const hasChildren = showsAny.get(node) === true;
          expanded = hasChildren && (query !== '' || this.isExpanded(key, budget));
          next.push({ key, path: node.path, depth, type: node.type, tag: node.tag, named: isNamed(node.type), visible: node.visible, waiting: node.waiting, connected: node.connected, hasChildren, expanded });
        }
        if (++work % ROWS_SLICE === 0) {
          await nextTask();
          if (!current()) return;
        }
        if (!expanded && show) continue;
        const childDepth = show ? depth + 1 : depth;
        for (let i = children.length - 1; i >= 0; i--) visits.push([children[i], childDepth]);
      }
    }

    if (!current()) return;
    this.rows = next;
    this.state.total = total;
    this.state.connected = connected;
    this.state.detached = total - connected;
    this.state.rowCount = next.length;
    this.state.rowsVersion++;
  }
}
