import { describe, expect, it } from 'vitest';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { idleClient, tick } from './helpers';

function fakeClient() {
  const events = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const shown = new Set<(shown: boolean) => void>();
  const reads: string[] = [];
  const client: Client = {
    ...idleClient,
    status: { connected: true, version: 1 },
    dock: null,
    async request<T>(method: string) {
      reads.push(method);
      return (method === 'getCounters' ? null : []) as T;
    },
    onEvent(listener) {
      events.add(listener);
      return () => events.delete(listener);
    },
    onStatus(listener) {
      statuses.add(listener);
      return () => statuses.delete(listener);
    },
    onShown(listener) {
      shown.add(listener);
      return () => shown.delete(listener);
    },
    onDock: () => () => {},
    setDock() {},
    dispose() {},
  };
  return {
    client,
    reads,
    connect: () => statuses.forEach((l) => l({ connected: true, version: 1 })),
    emit: () => events.forEach((l) => l({ type: 'tree:changed', payload: { parents: [[]] } })),
    host: (value: boolean) => shown.forEach((l) => l(value)),
  };
}

const counterReads = (reads: string[]) => reads.filter((m) => m === 'getCounters').length;

const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

describe('panel visibility', () => {
  it('does not read while the page hides the panel and reads once when it is shown again', async () => {
    const fake = fakeClient();
    const model = new DevtoolsModel(fake.client, { gap: 0 });
    fake.connect();
    await settle();
    expect(counterReads(fake.reads)).toBe(1);
    fake.host(false);
    expect(model.state.shown).toBe(false);
    fake.emit();
    fake.emit();
    await settle();
    expect(counterReads(fake.reads)).toBe(1);
    fake.host(true);
    await settle();
    expect(counterReads(fake.reads)).toBe(2);
    fake.host(false);
    fake.host(true);
    await settle();
    expect(counterReads(fake.reads)).toBe(2);
    model.dispose();
  });

  it('follows the shown and hidden notices of the DevTools panel', async () => {
    const fake = fakeClient();
    const panel = new Set<(shown: boolean) => void>();
    const model = new DevtoolsModel(fake.client, {
      gap: 0,
      shown: (listener) => {
        panel.add(listener);
        return () => panel.delete(listener);
      },
    });
    fake.connect();
    await settle();
    panel.forEach((l) => l(false));
    fake.emit();
    await settle();
    expect(counterReads(fake.reads)).toBe(1);
    panel.forEach((l) => l(true));
    await settle();
    expect(counterReads(fake.reads)).toBe(2);
    model.dispose();
    expect(panel.size).toBe(0);
  });
});
