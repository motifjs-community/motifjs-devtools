export const MARK = '$motif';
export const MAX_ENTRIES = 100;

export function toTransfer(value: unknown, depth = 4, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value) || Object.is(value, -0)) return { [MARK]: 'number', value: String(Object.is(value, -0) ? '-0' : value) };
    return value;
  }
  if (value === undefined) return { [MARK]: 'undefined' };
  if (typeof value === 'bigint') return { [MARK]: 'bigint', value: value.toString() };
  if (typeof value === 'symbol') return { [MARK]: 'symbol', value: value.description ?? '' };
  if (typeof value === 'function') return { [MARK]: 'function', name: value.name };

  const object = value as object;
  if (typeof (object as Node).nodeType === 'number' && typeof (object as Node).nodeName === 'string') {
    return { [MARK]: 'node', tag: (object as Node).nodeName.toLowerCase() };
  }
  if (object instanceof Date) return { [MARK]: 'date', value: Number.isNaN(object.getTime()) ? 'Invalid Date' : object.toISOString() };
  if (object instanceof RegExp) return { [MARK]: 'regexp', value: String(object) };
  if (object instanceof Error) return { [MARK]: 'error', name: object.name, message: object.message };
  if (seen.has(object)) return { [MARK]: 'circular' };

  if (depth <= 0) {
    if (Array.isArray(object)) return { [MARK]: 'array', length: object.length };
    if (object instanceof Map || object instanceof Set) return { [MARK]: object instanceof Map ? 'map' : 'set', size: object.size };
    return { [MARK]: 'object', type: typeName(object), keys: Object.keys(object).length };
  }

  seen.add(object);
  try {
    if (Array.isArray(object)) {
      const items = object.slice(0, MAX_ENTRIES).map((item) => toTransfer(item, depth - 1, seen));
      if (object.length > MAX_ENTRIES) items.push({ [MARK]: 'truncated', remaining: object.length - MAX_ENTRIES });
      return items;
    }
    if (object instanceof Map) {
      const entries: unknown[] = [];
      for (const [key, item] of object) {
        if (entries.length === MAX_ENTRIES) break;
        entries.push([toTransfer(key, depth - 1, seen), toTransfer(item, depth - 1, seen)]);
      }
      return { [MARK]: 'map', size: object.size, entries };
    }
    if (object instanceof Set) {
      const values: unknown[] = [];
      for (const item of object) {
        if (values.length === MAX_ENTRIES) break;
        values.push(toTransfer(item, depth - 1, seen));
      }
      return { [MARK]: 'set', size: object.size, values };
    }

    const result: Record<string, unknown> = {};
    const keys = Object.keys(object);
    for (const key of keys.slice(0, MAX_ENTRIES)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && !('value' in descriptor)) {
        result[key] = { [MARK]: 'getter' };
        continue;
      }
      const item = (object as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = toTransfer(item, depth - 1, seen);
    }
    const plain = typeName(object) === 'Object';
    if (plain && !(MARK in result) && keys.length <= MAX_ENTRIES) return result;
    return { [MARK]: 'object', type: typeName(object), keys: keys.length, value: result };
  } finally {
    seen.delete(object);
  }
}

function typeName(object: object): string {
  const proto = Object.getPrototypeOf(object);
  if (proto === null) return 'Object';
  return typeof proto.constructor === 'function' && proto.constructor.name ? proto.constructor.name : 'Object';
}
