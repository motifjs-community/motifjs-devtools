import { CALL_TIMEOUT, CONCURRENT_CALLS, EVENT_DEPTH, EVENT_RATE, EVENT_SIZE, MAX_EXTENSIONS, MAX_PANELS, PANELS_DEPTH, PANELS_NODES, PANELS_SIZE, ROW_DEPTH, SOURCE_SIZE, VALUE_DEPTH } from './limits';
import type { ContractResult } from './protocol';
import type { Scheduler } from './schedule';
import { MARK, toTransfer } from './serialize';

const isResult = (value: unknown): value is ContractResult => typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';

const sizeOf = (value: unknown) => JSON.stringify(value).length;

const failed = (error: unknown): ContractResult => ({ ok: false, error: String(error) });

/** The rows of a list are sent whole while they fit; the rest becomes one truncated marker. */
function boundedRows(rows: unknown[]): unknown[] {
  const out: unknown[] = [];
  let used = 2;
  for (let i = 0; i < rows.length; i++) {
    const row = toTransfer(rows[i], ROW_DEPTH);
    used += sizeOf(row) + 1;
    if (used > SOURCE_SIZE) {
      out.push({ [MARK]: 'truncated', remaining: rows.length - i });
      break;
    }
    out.push(row);
  }
  return out;
}

/** A single value goes at full depth; one that does not fit goes shallower, down to a summary. */
function boundedValue(value: unknown): unknown {
  if (Array.isArray(value)) return boundedRows(value);
  for (let depth = VALUE_DEPTH; depth >= 1; depth = Math.floor(depth / 2)) {
    const out = toTransfer(value, depth);
    if (sizeOf(out) <= SOURCE_SIZE) return out;
  }
  return toTransfer(value, 0);
}

export function sourceShape(result: unknown): unknown {
  if (!isResult(result)) return toTransfer(result, 4);
  return result.ok ? { ok: true, value: boundedValue(result.value) } : failed(result.error);
}

type Budget = { nodes: number; over: boolean };

/** Metadata is plain data by contract: copied as JSON with every object and array counted, nothing cut. */
function copyMetadata(value: unknown, depth: number, budget: Budget, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return toTransfer(value, 0);
  if (depth === 0 || seen.has(value) || ++budget.nodes > PANELS_NODES) {
    budget.over = true;
    return null;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => copyMetadata(item, depth - 1, budget, seen));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return toTransfer(value, 1);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = copyMetadata(item, depth - 1, budget, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function panelsShape(result: unknown): unknown {
  if (!isResult(result)) return toTransfer(result, 4);
  if (!result.ok) return failed(result.error);
  const panels = (result.value as { panels?: unknown } | null)?.panels;
  if (Array.isArray(panels) && panels.length > MAX_PANELS) return failed('too-many-panels');
  const budget: Budget = { nodes: 0, over: false };
  const copy = copyMetadata(result.value, PANELS_DEPTH, budget, new WeakSet());
  if (budget.over || sizeOf(copy) > PANELS_SIZE) return failed('panels-too-large');
  return { ok: true, value: copy };
}

/** The first names go through; the rest is one marker the panel can count. */
export function extensionsShape(value: unknown): unknown {
  if (!Array.isArray(value)) return toTransfer(value, 2);
  const names = value.filter((name): name is string => typeof name === 'string');
  if (names.length <= MAX_EXTENSIONS) return names;
  return [...names.slice(0, MAX_EXTENSIONS), { [MARK]: 'truncated', remaining: names.length - MAX_EXTENSIONS }];
}

/** A package event is copied once, deeper than the core's own events; one that is too big is replaced by its size. */
export function boundedEvent(payload: unknown): unknown {
  const copy = toTransfer(payload, EVENT_DEPTH);
  const size = sizeOf(copy);
  return size > EVENT_SIZE ? { [MARK]: 'truncated', size } : copy;
}

/** The page answers within the limit or the call is reported as timed out; the work itself goes on. */
export function withTimeout<T>(work: Promise<T>, timer: Scheduler['timer'], ms = CALL_TIMEOUT): Promise<T | ContractResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cancel = timer(() => {
      if (settled) return;
      settled = true;
      resolve(failed('timeout'));
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        cancel();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cancel();
        reject(error);
      },
    );
  });
}

/** Counts the slow calls a package has in flight; past the limit a call is answered busy before it runs. */
export function createCallGate(limit = CONCURRENT_CALLS) {
  const inFlight = new Map<string, number>();
  return {
    enter(name: string): boolean {
      const count = inFlight.get(name) ?? 0;
      if (count >= limit) return false;
      inFlight.set(name, count + 1);
      return true;
    },
    leave(name: string) {
      const count = (inFlight.get(name) ?? 1) - 1;
      if (count <= 0) inFlight.delete(name);
      else inFlight.set(name, count);
    },
  };
}

type Window = { start: number; count: number; dropped: number };

/**
 * Lets through a package's events up to the rate, per second of page time; what it drops is counted and told
 * once the second is over, so the panel can show that it did not see everything.
 */
export function createEventGate(report: (name: string, dropped: number) => void, rate = EVENT_RATE) {
  const windows = new Map<string, Window>();
  return {
    allow(name: string, now: number): boolean {
      let window = windows.get(name);
      if (window === undefined || now - window.start >= 1000) {
        if (window !== undefined && window.dropped > 0) report(name, window.dropped);
        window = { start: now, count: 0, dropped: 0 };
        windows.set(name, window);
      }
      if (window.count >= rate) {
        window.dropped++;
        return false;
      }
      window.count++;
      return true;
    },
    clear() {
      windows.clear();
    },
  };
}

/** `ext:<name>:<type>` → the package's name; the name may not contain a colon. */
export function extensionOf(type: string): string | null {
  if (!type.startsWith('ext:')) return null;
  const end = type.indexOf(':', 4);
  return end > 4 ? type.slice(4, end) : null;
}
