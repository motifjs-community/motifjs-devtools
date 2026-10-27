import { MARK, MAX_ENTRIES, toTransfer } from './serialize';

const isPlainNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);

export function plainCopy(value: unknown, depth: number): unknown {
  if (typeof value !== 'object' || value === null || depth <= 0 || Object.getPrototypeOf(value) !== Object.prototype) return toTransfer(value, depth);
  const keys = Object.keys(value);
  if (keys.length > MAX_ENTRIES || keys.includes(MARK)) return toTransfer(value, depth);
  const seen = new WeakSet<object>([value]);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) return toTransfer(value, depth);
    const item: unknown = descriptor.value;
    if (item === undefined) continue;
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || isPlainNumber(item)) out[key] = item;
    else if (Array.isArray(item) && depth > 1 && item.length <= MAX_ENTRIES && item.every(isPlainNumber)) out[key] = item.slice();
    else out[key] = toTransfer(item, depth - 1, seen);
  }
  return out;
}
