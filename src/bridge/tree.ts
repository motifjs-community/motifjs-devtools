import { TREE_FLAGS, type TreeRecord } from './protocol';
import type { Cancel } from './schedule';

export const TREE_SLICE = 500;

type TreeNodeLike = { type?: unknown; tag?: unknown; built?: unknown; visible?: unknown; waiting?: unknown; disposed?: unknown; connected?: unknown; document?: unknown; title?: unknown; childCount?: unknown };
type ReadTree = (path: number[], depth: number) => TreeNodeLike | null;

export interface TreeStream {
  slice(records: TreeRecord[]): void;
  done(count: number): void;
  fail(error: unknown): void;
}

const flagsOf = (node: TreeNodeLike) =>
  (node.built ? TREE_FLAGS.built : 0) |
  (node.visible ? TREE_FLAGS.visible : 0) |
  (node.waiting ? TREE_FLAGS.waiting : 0) |
  (node.disposed ? TREE_FLAGS.disposed : 0) |
  (node.connected ? TREE_FLAGS.connected : 0);

const childCountOf = (node: TreeNodeLike) => (typeof node.childCount === 'number' && node.childCount > 0 ? node.childCount : 0);

const recordOf = (path: number[], node: TreeNodeLike): TreeRecord => {
  const record: TreeRecord = [
    path.length,
    path.length === 0 ? 0 : path[path.length - 1],
    String(node.type ?? ''),
    String(node.tag ?? ''),
    flagsOf(node),
    childCountOf(node),
    typeof node.document === 'number' ? node.document : 0,
  ];
  if (typeof node.title === 'string' && node.title !== '') record.push(node.title);
  return record;
};

export function streamTree(read: ReadTree, out: TreeStream, task: (run: () => void) => Cancel, size = TREE_SLICE): Cancel {
  const stack: { path: number[]; next: number; count: number }[] = [];
  let count = 0;
  let stopped = false;
  let pending: Cancel | null = null;

  const step = () => {
    pending = null;
    if (stopped) return;
    const records: TreeRecord[] = [];
    try {
      if (count === 0) {
        const root = read([], 0);
        if (root === null) {
          stopped = true;
          out.done(0);
          return;
        }
        records.push(recordOf([], root));
        count++;
        if (childCountOf(root) > 0) stack.push({ path: [], next: 0, count: childCountOf(root) });
      }
      while (stack.length > 0 && records.length < size) {
        const top = stack[stack.length - 1];
        if (top.next >= top.count) {
          stack.pop();
          continue;
        }
        const path = [...top.path, top.next++];
        const node = read(path, 0);
        if (node === null) {
          top.next = top.count;
          continue;
        }
        records.push(recordOf(path, node));
        count++;
        if (childCountOf(node) > 0) stack.push({ path, next: 0, count: childCountOf(node) });
      }
    } catch (error) {
      stopped = true;
      out.fail(error);
      return;
    }
    if (records.length > 0) out.slice(records);
    if (stack.length === 0) {
      stopped = true;
      out.done(count);
      return;
    }
    pending = task(step);
  };

  step();
  return () => {
    stopped = true;
    pending?.();
    pending = null;
  };
}
