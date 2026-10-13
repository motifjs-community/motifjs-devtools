import { MARK } from '../bridge/serialize';

export type Formatted = { text: string; kind: 'string' | 'number' | 'boolean' | 'null' | 'function' | 'object' | 'component' | 'node' | 'other' };

export function formatValue(value: unknown): Formatted {
  if (value === null) return { text: 'null', kind: 'null' };
  if (typeof value === 'string') return { text: JSON.stringify(value), kind: 'string' };
  if (typeof value === 'number') return { text: String(value), kind: 'number' };
  if (typeof value === 'boolean') return { text: String(value), kind: 'boolean' };
  if (Array.isArray(value)) return { text: `Array(${value.length})`, kind: 'object' };
  if (typeof value !== 'object') return { text: String(value), kind: 'other' };

  const record = value as Record<string, unknown>;
  const marked = record[MARK];
  if (typeof marked === 'string') {
    switch (marked) {
      case 'undefined':
        return { text: 'undefined', kind: 'null' };
      case 'number':
      case 'bigint':
        return { text: String(record.value) + (marked === 'bigint' ? 'n' : ''), kind: 'number' };
      case 'symbol':
        return { text: `Symbol(${record.value})`, kind: 'other' };
      case 'function':
        return { text: `ƒ ${record.name || 'anonymous'}()`, kind: 'function' };
      case 'node':
        return { text: `<${record.tag}>`, kind: 'node' };
      case 'date':
      case 'regexp':
        return { text: String(record.value), kind: 'other' };
      case 'error':
        return { text: `${record.name}: ${record.message}`, kind: 'other' };
      case 'map':
      case 'set':
        return { text: `${marked === 'map' ? 'Map' : 'Set'}(${record.size})`, kind: 'object' };
      case 'array':
        return { text: `Array(${record.length})`, kind: 'object' };
      case 'object':
        return { text: `${record.type} {${record.keys}}`, kind: 'object' };
      case 'getter':
        return { text: '(getter)', kind: 'other' };
      case 'circular':
        return { text: '[Circular]', kind: 'other' };
      default:
        return { text: marked, kind: 'other' };
    }
  }

  switch (record.kind) {
    case 'getter':
      return { text: '(getter)', kind: 'other' };
    case 'function':
      return { text: `ƒ ${record.name || 'anonymous'}()`, kind: 'function' };
    case 'node':
      return { text: `<${record.tag}>`, kind: 'node' };
    case 'component':
      return { text: `<${record.type}>`, kind: 'component' };
    case 'array':
      return { text: `Array(${record.length})`, kind: 'object' };
    case 'object':
      return { text: `${record.type} {${record.keys}}`, kind: 'object' };
  }
  const keys = Object.keys(record);
  return { text: `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`, kind: 'object' };
}

export const pathKey = (path: readonly number[]) => path.join('.');

export const formatPath = (path: readonly number[] | null) => (path === null ? 'detached' : `[${path.join(', ')}]`);

export const formatMs = (value: number | undefined) => (value === undefined ? '–' : `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ms`);

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

export const formatClock = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};
