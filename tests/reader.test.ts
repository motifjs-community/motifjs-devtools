import { afterEach, describe, expect, it, vi } from 'vitest';
import { READ_FACTOR, READ_GAP, Reader } from '../src/panel/model/reader';

afterEach(() => {
  vi.useRealTimers();
});

function setup(cycle = 0) {
  vi.useFakeTimers();
  const state = { active: true, runs: 0 };
  const finishes: (() => void)[] = [];
  const reader = new Reader(
    () => {
      state.runs++;
      return new Promise<void>((resolve) =>
        finishes.push(() => {
          vi.advanceTimersByTime(cycle);
          resolve();
        }),
      );
    },
    () => state.active,
  );
  const finish = async () => {
    finishes.shift()!();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { reader, state, finish };
}

describe('Reader', () => {
  it('reads at once the first time and keeps the gap before the next automatic read', async () => {
    const { reader, state, finish } = setup();
    void reader.request();
    expect(state.runs).toBe(1);
    await finish();
    void reader.request();
    expect(state.runs).toBe(1);
    await vi.advanceTimersByTimeAsync(READ_GAP - 1);
    expect(state.runs).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.runs).toBe(2);
  });

  it('waits four times the last read when that is longer than the gap', async () => {
    const { reader, state, finish } = setup(100);
    void reader.request();
    await finish();
    void reader.request();
    await vi.advanceTimersByTimeAsync(READ_FACTOR * 100 - 1);
    expect(state.runs).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.runs).toBe(2);
  });

  it('runs one read at a time and reads once more after requests during a read', async () => {
    const { reader, state, finish } = setup();
    void reader.request();
    void reader.request();
    void reader.request(true);
    expect(state.runs).toBe(1);
    await finish();
    await vi.advanceTimersByTimeAsync(READ_GAP);
    expect(state.runs).toBe(2);
    await finish();
    await vi.advanceTimersByTimeAsync(READ_GAP * 4);
    expect(state.runs).toBe(2);
  });

  it('lets a user action read at once', async () => {
    const { reader, state, finish } = setup();
    void reader.request();
    await finish();
    void reader.request(true);
    expect(state.runs).toBe(2);
  });

  it('only marks the data stale while inactive and reads once when woken', async () => {
    const { reader, state, finish } = setup();
    state.active = false;
    await reader.request();
    await reader.request();
    expect(state.runs).toBe(0);
    reader.wake();
    expect(state.runs).toBe(0);
    state.active = true;
    reader.wake();
    expect(state.runs).toBe(1);
    await finish();
    reader.wake();
    expect(state.runs).toBe(1);
  });

  it('resolves a request when the read that covers it has finished', async () => {
    const { reader, finish } = setup();
    let first = false;
    let second = false;
    void reader.request(true).then(() => (first = true));
    void reader.request(true).then(() => (second = true));
    await finish();
    expect(first).toBe(true);
    expect(second).toBe(false);
    await vi.advanceTimersByTimeAsync(READ_GAP);
    await finish();
    expect(second).toBe(true);
  });

  it('stops when disposed', async () => {
    const { reader, state, finish } = setup();
    void reader.request();
    await finish();
    void reader.request();
    reader.dispose();
    await vi.advanceTimersByTimeAsync(READ_GAP * 2);
    expect(state.runs).toBe(1);
  });
});
