import { Virtualization, effect, reactive } from '@motifx/core';
import type { TreeWidget } from '../schema';
import { ReadingView, fieldOf, formatText, matches, rowsOf, type ViewClass } from './base';
import { LIST_HEIGHT, ROW_HEIGHT } from './table';

type Node = { key: string; id: unknown; depth: number; data: unknown; title: string; badge: string; children: number };

// a zero or an empty value is no badge
const badgeOf = (value: unknown) => (value === undefined || value === null || value === 0 || value === '' || value === false ? '' : formatText(value, undefined));

function TreeRow(props: { node: Node; open: () => boolean; selected: () => boolean; toggle: () => void; select: () => void; openRoute: () => void }) {
  const { node } = props;
  return (
    <div class={() => (props.selected() ? 'dt-row selected' : 'dt-row')} style={`--depth: ${node.depth}`} role="treeitem" onclick={() => props.select()} ondblclick={() => props.openRoute()}>
      <button
        type="button"
        class={() => (node.children > 0 ? (props.open() ? 'dt-caret open' : 'dt-caret') : 'dt-caret leaf')}
        aria-label={node.children > 0 ? 'Expand' : ''}
        onclick={(e: Event) => {
          e.stopPropagation();
          if (node.children > 0) props.toggle();
        }}
      ></button>
      <span class="dt-row-title">{node.title}</span>
      <span class="dt-chip tone-muted" x-display={() => node.badge !== ''}>
        {node.badge}
      </span>
    </div>
  );
}

/** Nested rows of a list source, opened one level at a time; a filter flattens the tree to what matches. */
class TreeView extends ReadingView<TreeWidget> {
  readonly open = reactive({ keys: {} as Record<string, boolean> });

  readonly list = new Virtualization<Node>({
    itemHeight: ROW_HEIGHT,
    autoRefresh: false,
    className: 'dt-vlist',
    dataRequest: async () => {
      const nodes = this.nodes();
      return { items: nodes, totalCount: nodes.length, hasMore: false };
    },
    itemTemplate: (node) => <TreeRow node={node} open={() => this.open.keys[node.key] === true} selected={() => this.isSelected(node)} toggle={() => this.toggle(node)} select={() => this.select(node)} openRoute={() => this.openRoute(node)} />,
  });

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-tree');
    if (this.widget.open !== undefined) this.class.add('openable');
    this.element.style.setProperty('--dt-list-height', `${this.widget.height ?? LIST_HEIGHT}px`);
  }

  override onBuilt() {
    super.onBuilt();
    const stop = effect(() => {
      const nodes = this.nodes();
      queueMicrotask(() => this.list.setData(nodes));
    });
    this.motif.setDisposable(stop);
  }

  private nodeOf(data: unknown, index: number, depth: number, prefix: string): Node {
    const field = this.widget.key;
    const id = field === undefined ? undefined : fieldOf(data, field);
    const own = id === undefined || id === null ? `#${index}` : String(id);
    return {
      key: prefix + own,
      id: id === undefined || id === null ? index : id,
      depth,
      data,
      title: formatText(fieldOf(data, this.widget.itemTitle), undefined),
      badge: badgeOf(this.widget.itemBadge === undefined ? undefined : fieldOf(data, this.widget.itemBadge)),
      children: rowsOf(fieldOf(data, this.widget.itemChildren)).length,
    };
  }

  private filtering = () => (this.widget.filters ?? []).some((filter) => {
    const wanted = this.scope.panel.values[filter.state];
    return wanted !== undefined && wanted !== null && wanted !== '';
  });

  private accepts = (data: unknown) => (this.widget.filters ?? []).every((filter) => matches(fieldOf(data, filter.field), this.scope.panel.values[filter.state]));

  nodes = (): Node[] => {
    const out: Node[] = [];
    const flat = this.filtering();
    const walk = (items: unknown[], depth: number, prefix: string) => {
      items.forEach((data, index) => {
        const node = this.nodeOf(data, index, flat ? 0 : depth, prefix);
        const children = rowsOf(fieldOf(data, this.widget.itemChildren));
        if (flat) {
          if (this.accepts(data)) out.push({ ...node, children: 0 });
          walk(children, depth + 1, `${node.key}/`);
          return;
        }
        out.push(node);
        if (this.open.keys[node.key] === true) walk(children, depth + 1, `${node.key}/`);
      });
    };
    walk(rowsOf(this.value()), 0, '');
    return out;
  };

  toggle(node: Node) {
    this.open.keys[node.key] = this.open.keys[node.key] !== true;
  }

  isSelected = (node: Node) => {
    const key = this.widget.select;
    if (key === undefined) return false;
    const chosen = this.scope.panel.values[key];
    return chosen !== undefined && (Object.is(chosen, node.id) || String(chosen) === String(node.id));
  };

  select(node: Node) {
    if (this.widget.select !== undefined) this.scope.model.setValue(this.scope.panel, this.widget.select, this.isSelected(node) ? undefined : node.id);
  }

  openRoute(node: Node) {
    if (this.widget.open !== undefined) this.scope.model.open(this.scope.panel, this.widget.open, node.data);
  }

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'Nothing to show'));

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.nodes().length === 0}>
          {() => this.emptyText()}
        </div>
        {this.list}
      </>
    );
  }
}

export const treeViews: Record<string, ViewClass> = { tree: TreeView };
