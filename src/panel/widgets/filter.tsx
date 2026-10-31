import { effect, reactive, untracked } from '@motifx/core';
import type { SourceEntry } from '../model/ExtensionsModel';
import type { FilterOption, FilterWidget } from '../schema';
import { WidgetView, fieldOf, formatText, rowsOf, type ViewClass } from './base';

type Option = { value: string | number | boolean; label: string };

const optionOf = (item: FilterOption): Option => (typeof item === 'object' ? item : { value: item, label: String(item) });

/** Search text, a choice or a switch, written into the panel's state for the widgets that filter by it. */
class FilterView extends WidgetView<FilterWidget> {
  readonly state = reactive({ entry: null as SourceEntry | null });

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-filter');
    this.class.add(this.widget.kind);
  }

  override onBuilt() {
    super.onBuilt();
    const options = this.widget.options;
    if (options === undefined || Array.isArray(options)) return;
    const stop = effect(() => {
      const params = this.resolve(options.params);
      this.state.entry = untracked(() => this.scope.model.entry(this.scope.panel, options.source, params));
    });
    this.motif.setDisposable(stop);
  }

  options = (): Option[] => {
    const options = this.widget.options;
    if (options === undefined) return [];
    if (Array.isArray(options)) return options.map(optionOf);
    return rowsOf(this.state.entry?.value)
      .map((row) => {
        const value = fieldOf(row, options.itemValue);
        const label = options.itemLabel === undefined ? value : fieldOf(row, options.itemLabel);
        return { value: value as Option['value'], label: formatText(label, undefined) };
      })
      .filter((option) => option.value !== undefined && option.value !== null);
  };

  current = () => this.scope.panel.values[this.widget.state];
  chosen = () => String(this.options().findIndex((option) => Object.is(option.value, this.current()) || String(option.value) === String(this.current())));

  write(value: unknown) {
    this.scope.model.setValue(this.scope.panel, this.widget.state, value);
  }

  pick(index: string) {
    const option = this.options()[Number(index)];
    this.write(option === undefined ? undefined : option.value);
  }

  override view() {
    const kind = this.widget.kind;
    return (
      <label class="dt-filter">
        <span class="dt-filter-label" x-display={() => this.widget.label !== undefined}>{this.widget.label ?? ''}</span>
        <input
          type="search"
          placeholder={this.widget.placeholder ?? ''}
          value={() => (typeof this.current() === 'string' ? (this.current() as string) : '')}
          oninput={(e: Event) => this.write((e.target as HTMLInputElement).value)}
          x-display={() => kind === 'search'}
        />
        <select value={() => this.chosen()} onchange={(e: Event) => this.pick((e.target as HTMLSelectElement).value)} x-display={() => kind === 'select'}>
          <option value="-1">{this.widget.placeholder ?? 'All'}</option>
          {this.options().map((option, index) => (
            <option key={`${index}:${String(option.value)}`} value={String(index)}>
              {option.label}
            </option>
          ))}
        </select>
        <input type="checkbox" checked={() => this.current() === true} onchange={(e: Event) => this.write((e.target as HTMLInputElement).checked)} x-display={() => kind === 'toggle'} />
      </label>
    );
  }
}

export const filterViews: Record<string, ViewClass> = { filter: FilterView };
