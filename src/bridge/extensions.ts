import { DEFAULT_LIMITS, ROW_DEPTH, VALUE_DEPTH, type Limits } from './limits';
import type { ContractResult } from './protocol';
import type { Scheduler } from './schedule';
import { MARK, toTransfer } from './serialize';

const isResult = (value: unknown): value is ContractResult => typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';

const sizeOf = (value: unknown) => JSON.stringify(value).length;

const failed = (error: unknown): ContractResult => ({ ok: false, error: String(error) });

/** The rows of a list are sent whole while they fit; the rest becomes one truncated marker. */
function boundedRows(rows: unknown[], limits: Limits): unknown[] {
  const out: unknown[] = [];
  let used = 2;
  for (let i = 0; i < rows.length; i++) {
    const row = toTransfer(rows[i], ROW_DEPTH);
    used += sizeOf(row) + 1;
    if (used > limits.sourceSize) {
      out.push({ [MARK]: 'truncated', remaining: rows.length - i });
      break;
    }
    out.push(row);
  }
  return out;
}

/** A single value goes at full depth; one that does not fit goes shallower, down to a summary. */
function boundedValue(value: unknown, limits: Limits): unknown {
  if (Array.isArray(value)) return boundedRows(value, limits);
  for (let depth = VALUE_DEPTH; depth >= 1; depth = Math.floor(depth / 2)) {
    const out = toTransfer(value, depth);
    if (sizeOf(out) <= limits.sourceSize) return out;
  }
  return toTransfer(value, 0);
}

export function sourceShape(result: unknown, limits: Limits = DEFAULT_LIMITS): unknown {
  if (!isResult(result)) return toTransfer(result, 4);
  return result.ok ? { ok: true, value: boundedValue(result.value, limits) } : failed(result.error);
}

type Budget = { nodes: number; over: boolean };

/** Metadata is plain data by contract: copied as JSON with every object and array counted, nothing cut. */
function copyMetadata(value: unknown, depth: number, budget: Budget, seen: WeakSet<object>, limits: Limits): unknown {
  if (value === null || typeof value !== 'object') return toTransfer(value, 0);
  if (depth === 0 || seen.has(value) || ++budget.nodes > limits.panelsNodes) {
    budget.over = true;
    return null;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => copyMetadata(item, depth - 1, budget, seen, limits));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return toTransfer(value, 1);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = copyMetadata(item, depth - 1, budget, seen, limits);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function panelsShape(result: unknown, limits: Limits = DEFAULT_LIMITS): unknown {
  if (!isResult(result)) return toTransfer(result, 4);
  if (!result.ok) return failed(result.error);
  const panels = (result.value as { panels?: unknown } | null)?.panels;
  if (Array.isArray(panels) && panels.length > limits.maxPanels) return failed('too-many-panels');
  const budget: Budget = { nodes: 0, over: false };
  const copy = copyMetadata(result.value, limits.panelsDepth, budget, new WeakSet(), limits);
  if (budget.over || sizeOf(copy) > limits.panelsSize) return failed('panels-too-large');
  return { ok: true, value: copy };
}

/** The first names go through; the rest is one marker the panel can count. */
export function extensionsShape(value: unknown, limits: Limits = DEFAULT_LIMITS): unknown {
  if (!Array.isArray(value)) return toTransfer(value, 2);
  const names = value.filter((name): name is string => typeof name === 'string');
  if (names.length <= limits.maxExtensions) return names;
  return [...names.slice(0, limits.maxExtensions), { [MARK]: 'truncated', remaining: names.length - limits.maxExtensions }];
}

/** A package event is copied once, deeper than the core's own events; one that is too big is replaced by its size. */
export function boundedEvent(payload: unknown, limits: Limits = DEFAULT_LIMITS): unknown {
  const copy = toTransfer(payload, limits.eventDepth);
  const size = sizeOf(copy);
  return size > limits.eventSize ? { [MARK]: 'truncated', size } : copy;
}

/** The page answers within the limit or the call is reported as timed out; the work itself goes on. */
export function withTimeout<T>(work: Promise<T>, timer: Scheduler['timer'], ms = DEFAULT_LIMITS.callTimeout): Promise<T | ContractResult> {
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
export function createCallGate(limit = DEFAULT_LIMITS.concurrentCalls) {
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
export function createEventGate(report: (name: string, dropped: number) => void, rate = DEFAULT_LIMITS.eventRate) {
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
