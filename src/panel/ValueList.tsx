import { formatValue } from './format';

type Entry = { key: string; text: string; kind: string };

export const entriesOf = (value: unknown): Entry[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const formatted = formatValue(item);
    return { key, text: formatted.text, kind: formatted.kind };
  });
};

export function ValueList(props: { value: () => unknown; empty: string }) {
  return (
    <span class="dt-params">
      <span class="dt-muted" x-display={() => entriesOf(props.value()).length === 0}>
        {props.empty}
      </span>
      {() =>
        entriesOf(props.value()).map((entry) => (
          <span class="dt-param" key={entry.key}>
            <b>{entry.key}</b>
            <code class={`dt-value ${entry.kind}`}>{entry.text}</code>
          </span>
        ))
      }
    </span>
  );
}
