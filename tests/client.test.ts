import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL, type BridgeMessage } from '../src/bridge/protocol';
import { createClient, type Port } from '../src/client/client';

function fakePort() {
  const sent: BridgeMessage[] = [];
  let handler: ((message: BridgeMessage) => void) | null = null;
  const port: Port = {
    post: (message) => sent.push(message),
    listen(next) {
      handler = next;
      return () => (handler = null);
    },
  };
  return { port, sent, deliver: (message: BridgeMessage) => handler?.(message) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client', () => {
  it('hands each event of a batch to every listener, in order, even when one listener throws', () => {
    const { port, deliver } = fakePort();
    const client = createClient(port);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    client.onEvent((event) => {
      if (event.type === 'b') throw new Error('broken listener');
    });
    client.onEvent((event) => seen.push(event.type));
    deliver({ channel: CHANNEL, kind: 'events', events: [{ type: 'a' }, { type: 'b' }, { type: 'c' }] });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('passes the chunks of a stream to its callback and resolves with the final response', async () => {
    const { port, sent, deliver } = fakePort();
    const client = createClient(port);
    const chunks: unknown[] = [];
    const stream = client.stream('readTree', (chunk) => chunks.push(chunk));
    const request = sent.find((m) => m.kind === 'request')!;
    expect(request).toMatchObject({ method: 'readTree' });
    const id = (request as { id: number }).id;
    deliver({ channel: CHANNEL, kind: 'chunk', id, value: [1] });
    deliver({ channel: CHANNEL, kind: 'chunk', id: id + 100, value: ['other'] });
    deliver({ channel: CHANNEL, kind: 'chunk', id, value: [2] });
    deliver({ channel: CHANNEL, kind: 'response', id, ok: true, value: { count: 2 } });
    await expect(stream.done).resolves.toEqual({ count: 2 });
    expect(chunks).toEqual([[1], [2]]);
  });

  it('cancels a stream on the page and rejects it', async () => {
    const { port, sent } = fakePort();
    const client = createClient(port);
    const stream = client.stream('readTree', () => {});
    const id = (sent.find((m) => m.kind === 'request') as { id: number }).id;
    stream.cancel();
    await expect(stream.done).rejects.toThrow('cancelled');
    expect(sent.at(-1)).toEqual({ channel: CHANNEL, kind: 'cancel', id });
  });

  it('keeps a long stream alive while chunks keep coming', async () => {
    vi.useFakeTimers();
    try {
      const { port, sent, deliver } = fakePort();
      const client = createClient(port, 100);
      const stream = client.stream('readTree', () => {});
      const id = (sent.find((m) => m.kind === 'request') as { id: number }).id;
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(80);
        deliver({ channel: CHANNEL, kind: 'chunk', id, value: [] });
      }
      deliver({ channel: CHANNEL, kind: 'response', id, ok: true, value: { count: 0 } });
      await expect(stream.done).resolves.toEqual({ count: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits longer for a call that runs a package\'s code than for an ordinary read', async () => {
    vi.useFakeTimers();
    try {
      const { port, sent, deliver } = fakePort();
      const client = createClient(port, 100, 400);
      const outcome = (promise: Promise<unknown>) => promise.then(() => 'answered', (error: Error) => error.message);
      const read = outcome(client.request('getCounters'));
      const command = outcome(client.request('callExtension', 'history', 'list', 'replay', { id: 1 }));
      const source = client.request('readExtensionSource', 'history', 'list', 'rows', {});
      const sourceOutcome = outcome(source);
      vi.advanceTimersByTime(100);
      expect(await read).toBe('timeout');
      vi.advanceTimersByTime(250);
      const sourceId = (sent.filter((m) => m.kind === 'request').at(-1) as { id: number }).id;
      deliver({ channel: CHANNEL, kind: 'response', id: sourceId, ok: true, value: { ok: true, value: [] } });
      expect(await sourceOutcome).toBe('answered');
      vi.advanceTimersByTime(50);
      expect(await command).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports when the page hides or shows the panel', () => {
    const { port, deliver } = fakePort();
    const client = createClient(port);
    const changes: boolean[] = [];
    client.onShown((shown) => changes.push(shown));
    expect(client.shown).toBe(true);
    deliver({ channel: CHANNEL, kind: 'visibility', shown: true });
    deliver({ channel: CHANNEL, kind: 'visibility', shown: false });
    deliver({ channel: CHANNEL, kind: 'visibility', shown: false });
    deliver({ channel: CHANNEL, kind: 'visibility', shown: true });
    expect(changes).toEqual([false, true]);
    expect(client.shown).toBe(true);
  });
});
