import { ComponentBase, disposableCore, IDisposable } from '@motifx/core';
import type { BridgeEventData, BridgeMessage } from '../src/bridge/protocol';
import type { Scheduler } from '../src/bridge/schedule';
import type { Stream } from '../src/client/client';

/** Reactive updates flush on a microtask; await this before asserting on the DOM. */
export const tick = () => Promise.resolve();

/** Builds a component and attaches it to document.body, the way an app would mount it. */
export function mount<T extends ComponentBase>(component: T): T {
  component.build();
  document.body.appendChild(component.element as Node);
  return component;
}

/**
 * Counts live components through the disposable tracker.
 * markAsDisposed can arrive more than once per instance during teardown, hence the WeakSet.
 */
export function trackComponents() {
  let alive = 0;
  const seen = new WeakSet<IDisposable>();
  const previous = disposableCore.disposableTracker;
  disposableCore.disposableTracker = {
    trackDisposable(x) {
      if (x instanceof ComponentBase) alive++;
    },
    markAsDisposed(x) {
      if (!(x instanceof ComponentBase) || seen.has(x)) return;
      seen.add(x);
      alive--;
    },
    setParent() {},
    markAsSingleton() {},
  };
  return {
    get alive() {
      return alive;
    },
    stop() {
      disposableCore.disposableTracker = previous;
    },
  };
}

export const idleClient = {
  shown: true,
  stream: <T>(): Stream<T> => ({ done: new Promise<T>(() => {}), cancel() {} }),
  onShown: () => () => {},
};

export const microScheduler: Scheduler = {
  frame: (run) => later(run),
  task: (run) => later(run),
  timer: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
};

function later(run: () => void) {
  let live = true;
  queueMicrotask(() => live && run());
  return () => {
    live = false;
  };
}

export const eventsIn = (messages: readonly BridgeMessage[]): BridgeEventData[] => messages.flatMap((m) => (m.kind === 'events' ? m.events : []));

export async function drain(rounds = 6) {
  for (let i = 0; i < rounds; i++) await tick();
}
