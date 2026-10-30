import type { Cancel, Scheduler } from './schedule';

type Api = {
  getElement(path: number[]): Node | null;
  getDocuments?(): Document[];
};

type FlushEffect = { path?: unknown; kind?: unknown };

type Rect = { left: number; top: number; width: number; height: number };

type Heat = { count: number; at: number };

export interface Flasher {
  readonly enabled: boolean;
  setEnabled(on: boolean): boolean;
  flush(payload: unknown): void;
  clear(): void;
  documentsChanged(): void;
  dispose(): void;
}

export const FLASH_TAG = 'motif-devtools-flash';
export const FLASH_DURATION = 600;
export const HEAT_WINDOW = 1000;
export const MAX_BOXES = 300;

const DOM_KINDS = new Set(['class', 'style', 'list', 'conditional', 'ternary', 'switch', 'when', 'method', 'virtual-data']);

export const touchesDom = (kind: unknown) =>
  typeof kind === 'string' && (DOM_KINDS.has(kind) || kind.startsWith('binding:') || kind.startsWith('attr:'));

const COLORS = ['#ff8f66', '#f5703a', '#e4572e', '#c62828'];

export const colorOf = (count: number) => COLORS[count >= 10 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0];

const STYLES = `
:host { all: initial; }
.flash {
  position: fixed; z-index: 2147483644; pointer-events: none; box-sizing: border-box;
  border: 1px solid var(--color); border-radius: 2px;
  animation: fade ${FLASH_DURATION}ms ease-in forwards;
}
.flash b {
  position: absolute; bottom: 100%; right: -1px; padding: 0 4px; border-radius: 3px 3px 0 0;
  background: var(--color); color: #fff; font: 600 10px/14px ui-monospace, 'Cascadia Code', Consolas, monospace;
}
.flash.below b { top: 100%; bottom: auto; border-radius: 0 0 3px 3px; }
@keyframes fade { from { opacity: 1; } to { opacity: 0; } }
`;

const isElement = (node: Node): node is Element => node.nodeType === 1;

const rectOf = (node: Node | null): Rect | null => {
  if (node === null || !node.isConnected) return null;
  let rect: Rect | null = null;
  if (isElement(node)) rect = node.getBoundingClientRect();
  else if (node.nodeType === 3 && node.ownerDocument) {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    rect = range.getBoundingClientRect();
  }
  return rect !== null && (rect.width > 0 || rect.height > 0) ? rect : null;
};

export function createFlasher(api: () => Api | null, scheduler: Scheduler, now: () => number = () => Date.now()): Flasher {
  let enabled = false;
  let pending = new Map<string, number[]>();
  let frame: Cancel | null = null;
  let sweep: Cancel | null = null;
  const heat = new Map<string, Heat>();
  const layers = new Map<Document, ShadowRoot>();
  const boxes = new Map<string, { box: HTMLElement; until: number }>();

  const layerFor = (doc: Document): ShadowRoot => {
    let root = layers.get(doc);
    if (root !== undefined && root.host.isConnected) return root;
    const host = doc.createElement(FLASH_TAG);
    root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLES;
    root.append(style);
    doc.documentElement.appendChild(host);
    layers.set(doc, root);
    return root;
  };

  const scheduleSweep = () => {
    if (sweep !== null) return;
    sweep = scheduler.timer(() => {
      sweep = null;
      const at = now();
      for (const [key, entry] of boxes) {
        if (entry.until > at) continue;
        entry.box.remove();
        boxes.delete(key);
      }
      for (const [key, entry] of heat) if (at - entry.at >= HEAT_WINDOW) heat.delete(key);
      if (boxes.size > 0 || heat.size > 0) scheduleSweep();
    }, FLASH_DURATION);
  };

  const draw = () => {
    frame = null;
    const contract = api();
    const batch = pending;
    pending = new Map();
    if (!enabled || contract === null) return;
    const found: { key: string; rect: Rect; doc: Document }[] = [];
    for (const [key, path] of batch) {
      if (found.length >= MAX_BOXES) break;
      const node = contract.getElement(path);
      const rect = rectOf(node);
      if (rect !== null && node?.ownerDocument) found.push({ key, rect, doc: node.ownerDocument });
    }
    const at = now();
    for (const { key, rect, doc } of found) {
      const last = heat.get(key);
      const count = last !== undefined && at - last.at < HEAT_WINDOW ? last.count + 1 : 1;
      heat.set(key, { count, at });
      boxes.get(key)?.box.remove();
      const box = doc.createElement('div');
      box.className = rect.top < 16 ? 'flash below' : 'flash';
      box.style.setProperty('--color', colorOf(count));
      Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      if (count > 1) {
        const label = doc.createElement('b');
        label.textContent = `×${count}`;
        box.append(label);
      }
      layerFor(doc).append(box);
      boxes.set(key, { box, until: at + FLASH_DURATION });
    }
    if (found.length > 0) scheduleSweep();
  };

  const clear = () => {
    frame?.();
    frame = null;
    sweep?.();
    sweep = null;
    pending = new Map();
    heat.clear();
    for (const { box } of boxes.values()) box.remove();
    boxes.clear();
  };

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) clear();
      return enabled;
    },
    flush(payload) {
      if (!enabled) return;
      const effects = (payload as { effects?: unknown } | null)?.effects;
      if (!Array.isArray(effects)) return;
      for (const effect of effects as FlushEffect[]) {
        const { path, kind } = effect ?? {};
        if (!Array.isArray(path) || !touchesDom(kind)) continue;
        pending.set(path.join('.'), path as number[]);
      }
      if (pending.size > 0 && frame === null) frame = scheduler.frame(draw);
    },
    clear,
    documentsChanged() {
      const current = api()?.getDocuments?.() ?? null;
      for (const [doc, root] of [...layers]) {
        if (current !== null && current.includes(doc)) continue;
        root.host.remove();
        layers.delete(doc);
      }
    },
    dispose() {
      enabled = false;
      clear();
      for (const root of layers.values()) root.host.remove();
      layers.clear();
    },
  };
}
