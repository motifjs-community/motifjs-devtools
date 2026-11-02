import type { ExtensionSourceSettings } from '../../bridge/protocol';
import { fieldOf, isTruncatedMarker } from '../values';

export const DEFAULT_MAX = 5000;
export const MAX_ROWS = 50_000;

export type RowAction = 'upsert' | 'append' | 'remove';

export const maxOf = (settings: ExtensionSourceSettings) => Math.min(MAX_ROWS, settings.max ?? DEFAULT_MAX);

const keyOf = (settings: ExtensionSourceSettings, row: unknown) => (settings.key === undefined ? undefined : fieldOf(row, settings.key));

const sameKey = (a: unknown, b: unknown) => a !== undefined && b !== undefined && (Object.is(a, b) || String(a) === String(b));

/** Keeps the newest rows up to the source's limit; the oldest go first. */
export function trimRows(rows: unknown[], settings: ExtensionSourceSettings): void {
  const max = maxOf(settings);
  if (rows.length > max) rows.splice(0, rows.length - max);
}

/**
 * Applies one event of the package to the rows the panel holds, in place: `upsert` replaces the row with the same
 * key or adds one, `append` adds, `remove` takes the row with the key away. Once the rows change by events they
 * are live, so a truncated marker from the read is dropped.
 */
export function changeRows(rows: unknown[], settings: ExtensionSourceSettings, action: RowAction, payload: unknown): void {
  if (isTruncatedMarker(rows[rows.length - 1])) rows.pop();
  if (action === 'remove') {
    const key = payload !== null && typeof payload === 'object' ? keyOf(settings, payload) : payload;
    for (let i = rows.length - 1; i >= 0; i--) if (sameKey(keyOf(settings, rows[i]), key)) rows.splice(i, 1);
    return;
  }
  const key = action === 'upsert' ? keyOf(settings, payload) : undefined;
  const at = key === undefined ? -1 : rows.findIndex((row) => sameKey(keyOf(settings, row), key));
  if (at >= 0) rows[at] = payload;
  else rows.push(payload);
  trimRows(rows, settings);
}
