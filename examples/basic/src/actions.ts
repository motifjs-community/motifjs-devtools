import { currentOperation, onWrite, registerDevtools, runOperation, type DevtoolsWrite } from '@motifx/core/devtools';
import type { PanelMetadata } from '@motifx-community/devtools';

// An action history as a package would keep one: every piece of work the app runs through runAction() is an
// operation of the core, so the stores it writes are known, and the panel shows them in time with their detail.

export type ActionStatus = 'running' | 'done' | 'failed';

type Change = { kind: string; target: string; key: string; value: string };

type Action = {
  id: number;
  name: string;
  lane: string;
  status: ActionStatus;
  startedAt: number;
  duration: number;
  parent: number | null;
  replayOf: number | null;
  error: string | null;
  changes: Change[];
};

const MAX_ACTIONS = 5000;
const MAX_CHANGES = 200;

const actions: Action[] = [];
const byId = new Map<number, Action>();
const bodies = new Map<number, () => unknown>();

const short = (value: unknown) => {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return String(value);
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  } catch {
    return String(value);
  }
};

const targetOf = (target: object) => (Array.isArray(target) ? 'array' : target instanceof Map ? 'map' : target instanceof Set ? 'set' : 'object');

function changeOf(write: DevtoolsWrite): Change {
  const target = targetOf(write.target);
  switch (write.kind) {
    case 'add':
    case 'update':
      return { kind: write.kind, target, key: String(write.key), value: short(write.value) };
    case 'delete':
      return { kind: 'delete', target, key: String(write.key), value: short(write.previous) };
    case 'clear':
      return { kind: 'clear', target, key: '', value: `${write.removed.length} removed` };
    case 'splice':
      return { kind: write.method, target, key: String(write.index), value: `+${write.added.length} -${write.removed.length}` };
    default:
      return { kind: 'mutate', target, key: '', value: '' };
  }
}

// a row of the timeline: small, sent with every start and end
const summary = (action: Action) => ({ id: action.id, name: action.name, lane: action.lane, status: action.status, startedAt: action.startedAt, duration: action.duration, parent: action.parent });

const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

const isThenable = (value: unknown): value is PromiseLike<unknown> => typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

const panel: PanelMetadata = {
  id: 'actions',
  title: 'Actions',
  icon: 'timeline',
  order: 35,
  capabilities: { read: true, subscribe: true, write: true },
  layout: {
    type: 'split',
    size: 0.62,
    primary: {
      type: 'stack',
      children: [
        {
          type: 'toolbar',
          children: [
            { type: 'filter', kind: 'search', state: 'query', placeholder: 'Filter actions' },
            { type: 'filter', kind: 'select', state: 'status', placeholder: 'Any status', options: ['running', 'done', 'failed'] },
            { type: 'counter', source: 'actions', label: 'actions' },
            { type: 'button', label: 'Clear', icon: 'trash', tone: 'danger', command: 'clear', confirm: 'Clear all actions?', refresh: ['actions'] },
          ],
        },
        {
          type: 'timeline',
          source: 'actions',
          key: 'id',
          select: 'actionId',
          itemTime: 'startedAt',
          itemDuration: 'duration',
          itemTitle: 'name',
          itemStatus: 'status',
          itemLane: 'lane',
          statusTones: { running: 'info', done: 'success', failed: 'danger' },
          filters: [
            { field: 'name', state: 'query' },
            { field: 'status', state: 'status' },
          ],
          open: { route: 'action', params: { id: { field: 'id' } } },
          window: 60_000,
          empty: 'Click a button in the app: every piece of work it does is an action',
        },
        {
          type: 'log',
          source: 'actions',
          itemTime: 'startedAt',
          itemTitle: 'name',
          itemLevel: 'status',
          levelTones: { running: 'info', done: 'success', failed: 'danger' },
          filters: [
            { field: 'name', state: 'query' },
            { field: 'status', state: 'status' },
          ],
          open: { route: 'action', params: { id: { field: 'id' } } },
          height: 160,
        },
      ],
    },
    secondary: {
      type: 'detail',
      source: 'selectedAction',
      params: { id: { state: 'actionId' } },
      empty: 'Select an action',
      sections: ['summary', { field: 'children', title: 'Nested actions' }, { field: 'changes', title: 'Store changes' }, 'error'],
      actions: [
        { type: 'button', label: 'Replay', icon: 'play', command: 'replay', args: { id: { state: 'actionId' } }, refresh: ['actions'] },
        { type: 'button', label: 'Open', navigate: { route: 'action', params: { id: { state: 'actionId' } } } },
      ],
    },
  },
  routes: [
    {
      id: 'action',
      title: { field: 'summary.name' },
      source: 'selectedAction',
      params: { id: { param: 'id' } },
      layout: {
        type: 'stack',
        children: [
          {
            type: 'detail',
            source: 'selectedAction',
            params: { id: { param: 'id' } },
            sections: ['summary', 'error'],
            actions: [{ type: 'button', label: 'Replay', icon: 'play', command: 'replay', args: { id: { param: 'id' } }, refresh: ['actions'] }],
            empty: 'This action is gone',
          },
          {
            type: 'table',
            title: 'Store changes',
            source: 'selectedAction',
            params: { id: { param: 'id' } },
            field: 'changes',
            columns: [
              { field: 'kind', width: 90 },
              { field: 'target', width: 80 },
              { field: 'key', width: 120 },
              { field: 'value' },
            ],
            height: 200,
            empty: 'No store changed',
          },
          {
            type: 'table',
            title: 'Nested actions',
            source: 'selectedAction',
            params: { id: { param: 'id' } },
            field: 'children',
            key: 'id',
            columns: [
              { field: 'id', width: 60 },
              { field: 'name' },
              { field: 'status', width: 90 },
              { field: 'duration', format: 'ms', align: 'end', width: 90 },
            ],
            open: { route: 'action', params: { id: { field: 'id' } } },
            height: 140,
            empty: 'No nested actions',
          },
        ],
      },
    },
  ],
  lanes: [{ id: 'actions', label: 'Actions', tone: 'accent', event: 'action:end', itemDuration: 'duration', itemTitle: 'name' }],
};

const devtools = registerDevtools('action-history', {
  describe: () => ({ actions: actions.length, failed: actions.filter((action) => action.status === 'failed').length }),
  sources: {
    actions: { read: () => actions.map(summary), key: 'id', events: { 'action:start': 'upsert', 'action:end': 'upsert', 'history:cleared': 'refresh' }, max: MAX_ACTIONS },
    selectedAction: {
      read: (params: { id?: number }) => {
        const action = typeof params.id === 'number' ? byId.get(params.id) : undefined;
        if (action === undefined) return null;
        return {
          summary: { ...summary(action), replayOf: action.replayOf },
          children: actions.filter((child) => child.parent === action.id).map(summary),
          changes: action.changes,
          error: action.error,
        };
      },
    },
  },
  commands: {
    replay: (args: { id?: number }) => {
      const action = typeof args.id === 'number' ? byId.get(args.id) : undefined;
      const body = action === undefined ? undefined : bodies.get(action.id);
      if (action === undefined || body === undefined) throw new Error('This action cannot be replayed');
      runAction(action.name, body, action.id);
    },
    clear: () => {
      actions.length = 0;
      byId.clear();
      bodies.clear();
      devtools.emit('history:cleared');
    },
  },
  panels: [panel],
});

onWrite((write) => {
  if (write.operationId === undefined) return;
  const action = byId.get(write.operationId);
  if (action !== undefined && action.changes.length < MAX_CHANGES) action.changes.push(changeOf(write));
});

function remember(action: Action, body: () => unknown) {
  actions.push(action);
  byId.set(action.id, action);
  bodies.set(action.id, body);
  while (actions.length > MAX_ACTIONS) {
    const oldest = actions.shift()!;
    byId.delete(oldest.id);
    bodies.delete(oldest.id);
  }
}

function finish(action: Action, began: number, error: unknown) {
  action.duration = Math.round((performance.now() - began) * 100) / 100;
  action.status = error === undefined ? 'done' : 'failed';
  action.error = error === undefined ? null : errorText(error);
  devtools.emit('action:end', summary(action));
  // a failed action is worth a look: the panel jumps to it, or marks Actions until the user opens it
  if (error !== undefined) devtools.reveal({ panel: 'actions', state: { actionId: action.id } });
}

/**
 * Runs `body` as an operation of the core and keeps it in the history: when it started, how long it took, whether
 * it failed, which stores it wrote and which actions ran inside it. An error is recorded and thrown on.
 */
export function runAction<T>(name: string, body: () => T, replayOf: number | null = null): T {
  const began = performance.now();
  let action: Action | null = null;
  let result: T;
  try {
    result = runOperation({ kind: 'action', name }, () => {
      const operation = currentOperation()!;
      action = { id: operation.id, name, lane: name.split('/')[0], status: 'running', startedAt: Date.now(), duration: 0, parent: operation.parent ?? null, replayOf, error: null, changes: [] };
      remember(action, body);
      devtools.emit('action:start', summary(action));
      return body();
    });
  } catch (error) {
    if (action !== null) finish(action, began, error);
    throw error;
  }
  const started = action as Action | null;
  if (started === null) return result;
  if (isThenable(result)) {
    result.then(
      () => finish(started, began, undefined),
      (error: unknown) => finish(started, began, error ?? new Error('rejected')),
    );
  } else finish(started, began, undefined);
  return result;
}
