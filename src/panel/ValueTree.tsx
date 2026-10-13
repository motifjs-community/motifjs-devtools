import { formatValue } from './format';

export type ValueEntry = { key: string; value: unknown; getter?: boolean };
export type ValueNode = { entries: ValueEntry[]; total: number } | { error: string };

export const valueId = (keys: readonly string[]) => keys.join('');

export interface ValueSource {
  node(keys: string[]): ValueNode | undefined;
  toggle(keys: string[]): void;
  editing?(keys: string[]): boolean;
  startEdit?(keys: string[]): void;
  commitEdit?(keys: string[], text: string, original: unknown): void;
  cancelEdit?(): void;
}

export const isEditable = (value: unknown) => value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
const editText = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : String(value));

export function Value(props: { value: unknown }) {
  const formatted = formatValue(props.value);
  return <span class={`dt-value ${formatted.kind}`}>{formatted.text}</span>;
}

export function EditableValue(props: { value: unknown; keys: string[]; source: ValueSource }) {
  const { value, keys, source } = props;
  const formatted = formatValue(value);
  const canEdit = source.startEdit !== undefined && isEditable(value);
  const editing = () => source.editing?.(keys) === true;
  return (
    <>
      <span
        class={canEdit ? `dt-value ${formatted.kind} editable` : `dt-value ${formatted.kind}`}
        title={canEdit ? 'Click to edit' : ''}
        x-display={() => !editing()}
        onclick={() => {
          if (canEdit) source.startEdit!(keys);
        }}
      >
        {formatted.text}
      </span>
      <input
        class="dt-edit"
        x-wait={() => !editing()}
        value={editText(value)}
        onMounted={(c: any) => (c?.element ?? c)?.focus?.()}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') source.commitEdit?.(keys, (e.target as HTMLInputElement).value, value);
          else if (e.key === 'Escape') source.cancelEdit?.();
        }}
        onblur={() => source.cancelEdit?.()}
      />
    </>
  );
}

export function PropNode(props: { name: string; value: unknown; keys: string[]; source: ValueSource; getter?: boolean }) {
  const { source, keys } = props;
  const shown = props.getter ? { kind: 'getter' } : props.value;
  const expandable = !props.getter && formatValue(props.value).kind === 'object';
  const node = () => source.node(keys);
  const entries = () => {
    const value = node();
    return value !== undefined && 'entries' in value ? value.entries : [];
  };
  const more = () => {
    const value = node();
    return value !== undefined && 'entries' in value ? value.total - value.entries.length : 0;
  };
  const error = () => {
    const value = node();
    return value !== undefined && 'error' in value ? value.error : '';
  };
  return (
    <div class="dt-prop">
      <div class="dt-prop-row" style={`--level: ${keys.length - 1}`}>
        <button
          type="button"
          class={() => (expandable ? (node() !== undefined ? 'dt-caret open' : 'dt-caret') : 'dt-caret leaf')}
          aria-label="Expand value"
          onclick={() => {
            if (expandable) source.toggle(keys);
          }}
        ></button>
        <span class="dt-prop-key">{props.name}</span>
        <EditableValue value={shown} keys={keys} source={source} />
      </div>
      <div class="dt-prop-children" x-display={() => node() !== undefined}>
        {entries().map((entry) => (
          <PropNode key={`${entry.key}:${JSON.stringify(entry.value) ?? ''}`} name={entry.key} value={entry.value} getter={entry.getter} keys={[...keys, entry.key]} source={source} />
        ))}
        <div class="dt-more" style={`--level: ${keys.length}`} x-display={() => more() > 0}>{() => `… ${more()} more`}</div>
        <div class="dt-more dt-error" style={`--level: ${keys.length}`} x-display={() => error() !== ''}>
          {() => error()}
        </div>
      </div>
    </div>
  );
}
