import { createOverlay, type Overlay } from './overlay';

type TreeNode = { type: string; tag: string; children?: { path: number[] }[] };

type Api = {
  getTree(path?: number[], depth?: number): TreeNode | null;
  getElement(path: number[]): Node | null;
  pathOfElement(node: Node | null): number[] | null;
  getDocuments?(): Document[];
};

export interface Picker {
  readonly picking: boolean;
  highlight(path: number[] | null): boolean;
  setPicking(on: boolean): boolean;
  documentsChanged(): void;
  dispose(): void;
}

const PANEL_TAGS = new Set(['MOTIF-DEVTOOLS', 'MOTIF-DEVTOOLS-OVERLAY']);
const PLAIN_TYPES = new Set(['Component', 'FragmentNode']);

type Rect = { left: number; top: number; width: number; height: number };

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).nodeType === 'number';
const isElement = (value: unknown): value is Element => isNode(value) && value.nodeType === 1;

const union = (rects: Rect[]): Rect | null => {
  const visible = rects.filter((r) => r.width > 0 || r.height > 0);
  if (visible.length === 0) return null;
  const left = Math.min(...visible.map((r) => r.left));
  const top = Math.min(...visible.map((r) => r.top));
  const right = Math.max(...visible.map((r) => r.left + r.width));
  const bottom = Math.max(...visible.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
};

export function createPicker(api: () => Api | null, emit: (type: string, payload: unknown) => void, makeOverlay: (doc: Document) => Overlay = createOverlay): Picker {
  let picking = false;
  let lastTarget: EventTarget | null = null;
  let frame = 0;
  const overlays = new Map<Document, Overlay>();
  const attached = new Set<Document>();

  const documentsOf = (contract: Api): Document[] => {
    const list = typeof contract.getDocuments === 'function' ? contract.getDocuments() : null;
    if (Array.isArray(list) && list.length > 0) return list;
    return typeof document === 'undefined' ? [] : [document];
  };

  const overlayFor = (doc: Document): Overlay => {
    let overlay = overlays.get(doc);
    if (overlay === undefined) {
      overlay = makeOverlay(doc);
      overlays.set(doc, overlay);
    }
    return overlay;
  };

  const hideAll = (except: Document | null = null) => {
    for (const [doc, overlay] of overlays) if (doc !== except) overlay.hide();
  };

  const rectOfNode = (node: Node | null): Rect | null => {
    if (node === null || !node.isConnected) return null;
    if (isElement(node)) return node.getBoundingClientRect();
    if (node.nodeType === 3 && node.ownerDocument) {
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    }
    return null;
  };

  const rectOfPath = (contract: Api, path: number[], depth = 0): { rect: Rect; doc: Document } | null => {
    const own = contract.getElement(path);
    const rect = rectOfNode(own);
    if (rect !== null && own?.ownerDocument) return { rect, doc: own.ownerDocument };
    if (rect !== null || depth > 3) return null;
    const node = contract.getTree(path, 1);
    const found = (node?.children ?? []).map((child) => rectOfPath(contract, child.path, depth + 1)).filter((r): r is { rect: Rect; doc: Document } => r !== null);
    const merged = union(found.map((f) => f.rect));
    return merged === null ? null : { rect: merged, doc: found[0].doc };
  };

  const show = (path: number[]): boolean => {
    const contract = api();
    if (contract === null) return false;
    const found = rectOfPath(contract, path);
    const node = contract.getTree(path, 0);
    if (found === null || node === null) {
      hideAll();
      return false;
    }
    const name = PLAIN_TYPES.has(node.type) ? `<${node.tag}>` : node.type;
    const tag = PLAIN_TYPES.has(node.type) ? '' : `<${node.tag}>`;
    hideAll(found.doc);
    overlayFor(found.doc).show(found.rect, `${name}\u0000${tag} ${Math.round(found.rect.width)}×${Math.round(found.rect.height)}`.trimEnd());
    return true;
  };

  const fromPanel = (event: Event) =>
    event.composedPath().some((node) => isElement(node) && PANEL_TAGS.has(node.tagName));

  const pathAt = (event: Event): number[] | null => {
    const contract = api();
    if (contract === null) return null;
    const target = event.composedPath()[0];
    return isNode(target) ? contract.pathOfElement(target) : null;
  };

  const onMove = (event: PointerEvent) => {
    if (fromPanel(event) || event.target === lastTarget) return;
    lastTarget = event.target;
    const path = pathAt(event);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (path === null) hideAll();
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

  const attach = (doc: Document) => {
    const win = doc.defaultView;
    if (!win || attached.has(doc)) return;
    for (const [type, listener] of listeners) win.addEventListener(type, listener, true);
    doc.documentElement?.style.setProperty('cursor', 'crosshair', 'important');
    attached.add(doc);
  };

  const detach = (doc: Document) => {
    if (!attached.has(doc)) return;
    attached.delete(doc);
    const win = doc.defaultView;
    try {
      if (win) for (const [type, listener] of listeners) win.removeEventListener(type, listener, true);
      doc.documentElement?.style.removeProperty('cursor');
    } catch {
      // the window is already gone
    }
  };

  const start = () => {
    if (picking) return;
    const contract = api();
    if (contract === null) return;
    picking = true;
    lastTarget = null;
    for (const doc of documentsOf(contract)) attach(doc);
    emit('devtools:pick', { active: true });
  };

  const stop = () => {
    if (!picking) return;
    picking = false;
    cancelAnimationFrame(frame);
    for (const doc of [...attached]) detach(doc);
    hideAll();
    emit('devtools:pick', { active: false });
  };

  return {
    get picking() {
      return picking;
    },
    highlight(path) {
      if (path === null) {
        hideAll();
        return true;
      }
      return show(path);
    },
    setPicking(on) {
      if (on) start();
      else stop();
      return picking;
    },
    documentsChanged() {
      const contract = api();
      const current = contract === null ? [] : documentsOf(contract);
      for (const [doc, overlay] of [...overlays]) {
        if (current.includes(doc)) continue;
        overlay.dispose();
        overlays.delete(doc);
      }
      if (!picking) return;
      for (const doc of [...attached]) if (!current.includes(doc)) detach(doc);
      for (const doc of current) attach(doc);
    },
    dispose() {
      stop();
      for (const overlay of overlays.values()) overlay.dispose();
      overlays.clear();
    },
  };
}
