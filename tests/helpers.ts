import { ComponentBase, disposableCore, IDisposable } from '@motifx/core';

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
