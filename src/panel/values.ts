import { MARK } from '../bridge/serialize';
import { formatValue } from './format';
import type { ValueEntry } from './ValueTree';

/** One step into a value as the bridge sent it: plain objects and arrays, or the marked copies of other objects. */
export function entriesOf(value: unknown): ValueEntry[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.map((item, index) => ({ key: String(index), value: item }));
  const record = value as Record<string, unknown>;
  const mark = record[MARK];
  if (mark === 'object' && typeof record.value === 'object' && record.value !== null) return Object.entries(record.value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));
  if (mark === 'map' && Array.isArray(record.entries)) return record.entries.map((pair) => ({ key: formatValue((pair as unknown[])[0]).text, value: (pair as unknown[])[1] }));
  if (mark === 'set' && Array.isArray(record.values)) return record.values.map((item, index) => ({ key: String(index), value: item }));
  if (typeof mark === 'string') return [];
  return Object.entries(record).map(([key, item]) => ({ key, value: item }));
}

export function fieldOf(value: unknown, field: string | undefined): unknown {
  if (field === undefined || field === '') return value;
  let current = value;
  for (const key of field.split('.')) {
    current = entriesOf(current).find((entry) => entry.key === key)?.value;
    if (current === undefined) return undefined;
  }
  return current;
}

export const isTruncatedMarker = (value: unknown): value is { remaining: number } =>
  value !== null && typeof value === 'object' && (value as Record<string, unknown>)[MARK] === 'truncated' && typeof (value as Record<string, unknown>).remaining === 'number';

/** The rows of a list source: the array itself, or nothing. A truncated marker at the end is not a row. */
export function rowsOf(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return isTruncatedMarker(value[value.length - 1]) ? value.slice(0, -1) : value;
}

export function isTruncated(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const last = value[value.length - 1];
  return isTruncatedMarker(last) ? last.remaining : 0;
}
