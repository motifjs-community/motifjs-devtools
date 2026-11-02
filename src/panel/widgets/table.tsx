import { Virtualization, effect, reactive } from '@motifx/core';
import type { Column, TableWidget } from '../schema';
import { ReadingView, compareValues, fieldOf, formatText, isTruncated, matches, rowsOf, type ViewClass } from './base';

export const ROW_HEIGHT = 28;
export const LIST_HEIGHT = 320;

type Row = { key: string; id: unknown; data: unknown };

export const columnsTemplate = (columns: readonly Column[]) => columns.map((column) => (typeof column.width === 'number' ? `${column.width}px` : 'minmax(0, 1fr)')).join(' ');

function TableRow(props: { row: Row; columns: Column[]; selected: () => boolean; select: () => void; open: () => void }) {
  return (
    <div class={() => (props.selected() ? 'dt-trow selected' : 'dt-trow')} role="row" onclick={() => props.select()} ondblclick={() => props.open()}>
      {props.columns.map((column, index) => {
        const text = formatText(fieldOf(props.row.data, column.field), column.format);
        return (
          <span key={index} class={column.align === 'end' ? 'dt-tcell end' : 'dt-tcell'} role="cell" title={text}>
            {text}
          </span>
        );
      })}
    </div>
  );
}

/** Rows of a list source with sorting, the filters other widgets wrote and one selected row kept in the state. */
class TableView extends ReadingView<TableWidget> {
  readonly sort = reactive({ field: null as string | null, dir: 'asc' as 'asc' | 'desc' });

  readonly list = new Virtualization<Row>({
    itemHeight: ROW_HEIGHT,
    autoRefresh: false,
    className: 'dt-vlist',
    dataRequest: async () => {
      const rows = this.rows();
      return { items: rows, totalCount: rows.length, hasMore: false };
    },
    itemTemplate: (row) => <TableRow row={row} columns={this.widget.columns} selected={() => this.isSelected(row)} select={() => this.select(row)} open={() => this.open(row)} />,
  });

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-table');
    if (this.widget.open !== undefined) this.class.add('openable');
    this.sort.field = this.widget.sort?.field ?? null;
    this.sort.dir = this.widget.sort?.dir ?? 'asc';
    this.element.style.setProperty('--dt-cols', columnsTemplate(this.widget.columns));
    this.element.style.setProperty('--dt-list-height', `${this.widget.height ?? LIST_HEIGHT}px`);
  }

  override onBuilt() {
    super.onBuilt();
    const stop = effect(() => {
      const rows = this.rows();
      queueMicrotask(() => this.list.setData(rows));
    });
    this.motif.setDisposable(stop);
  }

  keyOf = (data: unknown, index: number): { key: string; id: unknown } => {
    const field = this.widget.key;
    const id = field === undefined ? undefined : fieldOf(data, field);
    return id === undefined || id === null ? { key: `#${index}`, id: index } : { key: String(id), id };
  };

  rows = (): Row[] => {
    const values = this.scope.panel.values;
    let rows = rowsOf(this.value()).map((data, index) => ({ ...this.keyOf(data, index), data }));
    for (const filter of this.widget.filters ?? []) {
      const wanted = values[filter.state];
      rows = rows.filter((row) => matches(fieldOf(row.data, filter.field), wanted));
    }
    const field = this.sort.field;
    if (field !== null) {
      const direction = this.sort.dir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => direction * compareValues(fieldOf(a.data, field), fieldOf(b.data, field)));
    }
    return rows;
  };

  left = () => isTruncated(this.value());

  isSelected = (row: Row) => {
    const key = this.widget.select;
    if (key === undefined) return false;
    const chosen = this.scope.panel.values[key];
    return chosen !== undefined && (Object.is(chosen, row.id) || String(chosen) === row.key);
  };

  select(row: Row) {
    if (this.widget.select !== undefined) this.scope.model.setValue(this.scope.panel, this.widget.select, this.isSelected(row) ? undefined : row.id);
  }

  open(row: Row) {
    if (this.widget.open !== undefined) this.scope.model.open(this.scope.panel, this.widget.open, row.data);
  }

  sortBy(field: string) {
    if (this.sort.field === field) this.sort.dir = this.sort.dir === 'asc' ? 'desc' : 'asc';
    else {
      this.sort.field = field;
      this.sort.dir = 'asc';
    }
  }

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'No rows'));

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class="dt-thead" role="row">
          {this.widget.columns.map((column, index) => (
            <button
              key={index}
              type="button"
              class={() => `dt-th${column.align === 'end' ? ' end' : ''}${this.sort.field === column.field ? ` sorted ${this.sort.dir}` : ''}`}
              role="columnheader"
              onclick={() => this.sortBy(column.field)}
            >
              {column.title ?? column.field}
            </button>
          ))}
        </div>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.rows().length === 0}>
          {() => this.emptyText()}
        </div>
        {this.list}
        <small class="dt-w-more dt-muted" x-display={() => this.left() > 0}>
          {() => `${this.left().toLocaleString('en-US')} more rows were not sent (limit of one read)`}
        </small>
      </>
    );
  }
}

export const tableViews: Record<string, ViewClass> = { table: TableView };
