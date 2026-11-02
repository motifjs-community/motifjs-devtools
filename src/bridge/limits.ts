// What the extension methods and events may carry (JSON text length), how many there may be, how long a call may take.
export const SOURCE_SIZE = 1_000_000;
export const PANELS_SIZE = 256_000;
export const PANELS_NODES = 2000;
export const PANELS_DEPTH = 32;
export const ROW_DEPTH = 7;
export const VALUE_DEPTH = 8;
export const CALL_TIMEOUT = 10_000;
export const CONCURRENT_CALLS = 4;
export const MAX_EXTENSIONS = 32;
export const MAX_PANELS = 8;
export const EVENT_DEPTH = 6;
export const EVENT_SIZE = 64_000;
export const EVENT_RATE = 1000;

/** The limits a bridge applies to packages; `createBridge({ limits })` and `mount({ limits })` change them. */
export type Limits = {
  /** JSON length of one source answer; a list is cut with a truncated marker, a single value goes shallower. */
  sourceSize: number;
  /** JSON length, object count and depth of a package's panel metadata; past any of them it is refused whole. */
  panelsSize: number;
  panelsNodes: number;
  panelsDepth: number;
  /** How long a source read or a command may take before it is answered as timed out. */
  callTimeout: number;
  /** Reads and commands of one package in flight at the same time; the next is answered busy. */
  concurrentCalls: number;
  maxExtensions: number;
  maxPanels: number;
  /** Depth and JSON length of one package event; a bigger one is replaced by its size. */
  eventDepth: number;
  eventSize: number;
  /** Events of one package per second; the rest are dropped and counted. */
  eventRate: number;
};

export const DEFAULT_LIMITS: Limits = {
  sourceSize: SOURCE_SIZE,
  panelsSize: PANELS_SIZE,
  panelsNodes: PANELS_NODES,
  panelsDepth: PANELS_DEPTH,
  callTimeout: CALL_TIMEOUT,
  concurrentCalls: CONCURRENT_CALLS,
  maxExtensions: MAX_EXTENSIONS,
  maxPanels: MAX_PANELS,
  eventDepth: EVENT_DEPTH,
  eventSize: EVENT_SIZE,
  eventRate: EVENT_RATE,
};

/** The defaults with the given numbers over them; anything that is not a positive number is ignored. */
export function withLimits(given: Partial<Limits> | undefined): Limits {
  const limits = { ...DEFAULT_LIMITS };
  if (given === undefined) return limits;
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]) {
    const value = given[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) limits[key] = value;
  }
  return limits;
}
