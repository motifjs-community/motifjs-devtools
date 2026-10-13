import { createOverlay, type Overlay } from './overlay';

type TreeNode = { type: string; tag: string; children?: { path: number[] }[] };

type Api = {
  getTree(path?: number[], depth?: number): TreeNode | null;
  getElement(path: number[]): Node | null;
  pathOfElement(node: Node | null): number[] | null;
};

export interface Picker {
  readonly picking: boolean;
  highlight(path: number[] | null): boolean;
  setPicking(on: boolean): boolean;
  dispose(): void;
}

const PANEL_TAGS = new Set(['MOTIF-DEVTOOLS', 'MOTIF-DEVTOOLS-OVERLAY']);
const PLAIN_TYPES = new Set(['Component', 'FragmentNode']);

type Rect = { left: number; top: number; width: number; height: number };

const union = (rects: Rect[]): Rect | null => {
  const visible = rects.filter((r) => r.width > 0 || r.height > 0);
  if (visible.length === 0) return null;
  const left = Math.min(...visible.map((r) => r.left));
  const top = Math.min(...visible.map((r) => r.top));
  const right = Math.max(...visible.map((r) => r.left + r.width));
  const bottom = Math.max(...visible.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
};

export function createPicker(api: () => Api | null, emit: (type: string, payload: unknown) => void, overlay: Overlay = createOverlay()): Picker {
  let picking = false;
  let lastTarget: EventTarget | null = null;
  let frame = 0;

  const rectOfNode = (node: Node | null): Rect | null => {
    if (node === null || !node.isConnected) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).getBoundingClientRect();
    if (node.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    }
    return null;
  };

  const rectOfPath = (contract: Api, path: number[], depth = 0): Rect | null => {
    const own = rectOfNode(contract.getElement(path));
    if (own !== null || depth > 3) return own;
    const node = contract.getTree(path, 1);
    const rects = (node?.children ?? []).map((child) => rectOfPath(contract, child.path, depth + 1)).filter((r): r is Rect => r !== null);
    return union(rects);
  };

  const show = (path: number[]): boolean => {
    const contract = api();
    if (contract === null) return false;
    const rect = rectOfPath(contract, path);
    const node = contract.getTree(path, 0);
    if (rect === null || node === null) {
      overlay.hide();
      return false;
    }
    const name = PLAIN_TYPES.has(node.type) ? `<${node.tag}>` : node.type;
    const tag = PLAIN_TYPES.has(node.type) ? '' : `<${node.tag}>`;
    overlay.show(rect, `${name}\u0000${tag} ${Math.round(rect.width)}×${Math.round(rect.height)}`.trimEnd());
    return true;
  };

  const fromPanel = (event: Event) =>
    event.composedPath().some((node) => node instanceof Element && PANEL_TAGS.has(node.tagName));

  const pathAt = (event: Event): number[] | null => {
    const contract = api();
    if (contract === null) return null;
    const target = event.composedPath()[0];
    return target instanceof Node ? contract.pathOfElement(target) : null;
  };

  const onMove = (event: PointerEvent) => {
    if (fromPanel(event) || event.target === lastTarget) return;
    lastTarget = event.target;
    const path = pathAt(event);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (path === null) overlay.hide();
      else show(path);
    });
  };

  const block = (event: Event) => {
    if (fromPanel(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onClick = (event: MouseEvent) => {
    if (fromPanel(event)) return;
    block(event);
    const path = pathAt(event);
    stop();
    if (path !== null) emit('devtools:picked', { path });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    block(event);
    stop();
  };

  const listeners: [string, EventListener][] = [
    ['pointermove', onMove as EventListener],
    ['pointerdown', block],
    ['pointerup', block],
    ['mousedown', block],
    ['mouseup', block],
    ['click', onClick as EventListener],
    ['keydown', onKey as EventListener],
  ];

  const start = () => {
    if (picking) return;
    picking = true;
    lastTarget = null;
    for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
    emit('devtools:pick', { active: true });
  };

  const stop = () => {
    if (!picking) return;
    picking = false;
    cancelAnimationFrame(frame);
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    document.documentElement.style.removeProperty('cursor');
    overlay.hide();
    emit('devtools:pick', { active: false });
  };

  return {
    get picking() {
      return picking;
    },
    highlight(path) {
      if (picking) return false;
      if (path === null) {
        overlay.hide();
        return true;
      }
      return show(path);
    },
    setPicking(on) {
      if (on) {
        if (api() === null) return false;
        start();
      } else {
        stop();
      }
      return true;
    },
    dispose() {
      stop();
      overlay.dispose();
    },
  };
}
