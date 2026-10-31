import { formatValue } from '../format';
import type { Column, DetailSection, DetailWidget } from '../schema';
import { ReadingView, entriesOf, fieldOf, formatText, host, rowsOf, type ViewClass } from './base';
import { columnsTemplate } from './table';

type Section = { field: string; title: string; view: 'auto' | 'fields' | 'table' | 'code' | 'json' | 'value'; columns?: Column[]; format?: Column['format'] };

type View = 'fields' | 'table' | 'code' | 'json' | 'value' | 'empty';

const normalize = (section: DetailSection): Section => (typeof section === 'string' ? { field: section, title: section, view: 'auto' } : { field: section.field, title: section.title ?? section.field, view: section.view ?? 'auto', columns: section.columns, format: section.format });

const isPlain = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** What a section shows is read from its value: a list of objects is a table, an object its fields, long text code. */
function viewOf(section: Section, value: unknown): View {
  if (value === undefined || value === null || value === '') return 'empty';
  if (section.view !== 'auto') return section.view;
  if (Array.isArray(value)) {
    const rows = rowsOf(value);
    if (rows.length === 0) return 'empty';
    return rows.every(isPlain) ? 'table' : 'json';
  }
  if (isPlain(value)) return entriesOf(value).length > 0 ? 'fields' : 'empty';
  if (typeof value === 'string' && value.includes('\n')) return 'code';
  return 'value';
}

const columnsOf = (section: Section, rows: unknown[]): Column[] => section.columns ?? entriesOf(rows[0]).slice(0, 8).map((entry) => ({ field: entry.key }));

function SectionView(props: { section: Section; value: () => unknown }) {
  const { section } = props;
  const view = () => viewOf(section, props.value());
  const rows = () => rowsOf(props.value());
  const columns = () => columnsOf(section, rows());
  const code = () => (view() === 'json' ? JSON.stringify(props.value(), null, 2) : String(props.value() ?? ''));
  return (
    <section class="dt-detail-section" x-display={() => view() !== 'empty'}>
      <small class="dt-w-title">{section.title}</small>
      <dl class="dt-fields" x-display={() => view() === 'fields'}>
        {() =>
          entriesOf(props.value()).map((entry) => (
            <div class="dt-field" key={entry.key}>
              <dt>{entry.key}</dt>
              <dd class={`dt-value ${formatValue(entry.value).kind}`}>{formatText(entry.value, undefined)}</dd>
            </div>
          ))
        }
      </dl>
      <div class="dt-mini-table" role="table" style={() => `--dt-cols: ${columnsTemplate(columns())}`} x-display={() => view() === 'table'}>
        <div class="dt-thead" role="row">
          {() =>
            columns().map((column, index) => (
              <span key={index} class={column.align === 'end' ? 'dt-th end' : 'dt-th'} role="columnheader">
                {column.title ?? column.field}
              </span>
            ))
          }
        </div>
        {() =>
          rows().map((row, rowIndex) => (
            <div class="dt-trow" role="row" key={rowIndex}>
              {columns().map((column, index) => (
                <span key={index} class={column.align === 'end' ? 'dt-tcell end' : 'dt-tcell'} role="cell">
                  {formatText(fieldOf(row, column.field), column.format)}
                </span>
              ))}
            </div>
          ))
        }
      </div>
      <pre class="dt-code" x-display={() => view() === 'code' || view() === 'json'}>
        {() => code()}
      </pre>
      <span class={() => `dt-w-value dt-value ${formatValue(props.value()).kind}`} x-display={() => view() === 'value'}>
        {() => formatText(props.value(), section.format)}
      </span>
    </section>
  );
}

/** One record of a source, section by section, with the commands that act on it. */
class DetailView extends ReadingView<DetailWidget> {
  readonly sections = () => this.widget.sections.map(normalize);

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-detail');
  }

  override onBuilt() {
    super.onBuilt();
    const actions = this.widget.actions ?? [];
    if (actions.length === 0) return;
    const bar = host('dt-detail-actions');
    bar.controls.add(...actions.map((action) => this.scope.build(action, this.scope)));
    this.controls.add(bar);
  }

  missing = () => this.value() === undefined || this.value() === null;

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'Nothing selected'));

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.missing()}>
          {() => this.emptyText()}
        </div>
        {this.sections().map((section) => (
          <SectionView key={section.field} section={section} value={() => (this.missing() ? undefined : fieldOf(this.value(), section.field))} />
        ))}
      </>
    );
  }
}

export const detailViews: Record<string, ViewClass> = { detail: DetailView };
