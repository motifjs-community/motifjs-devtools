export interface Overlay {
  show(rect: { left: number; top: number; width: number; height: number }, label: string): void;
  hide(): void;
  dispose(): void;
}

const OVERLAY_TAG = 'motif-devtools-overlay';

const STYLES = `
:host { all: initial; }
.box {
  position: fixed; z-index: 2147483645; pointer-events: none; box-sizing: border-box;
  border: 1px solid #8b7cff; background: rgba(139, 124, 255, 0.18); border-radius: 2px;
}
.label {
  position: fixed; z-index: 2147483645; pointer-events: none; white-space: nowrap;
  padding: 3px 7px; border-radius: 4px; background: #1e1e1e; color: #e6e6e6;
  font: 11px/1.4 ui-monospace, 'Cascadia Code', Consolas, monospace; box-shadow: 0 2px 8px rgba(0,0,0,.3);
}
.label b { color: #b9afff; font-weight: 600; }
[hidden] { display: none; }
`;

export function createOverlay(doc: Document = document): Overlay {
  let host: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let label: HTMLElement | null = null;

  const ensure = () => {
    if (host !== null && host.isConnected) return;
    host = doc.createElement(OVERLAY_TAG);
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLES;
    box = doc.createElement('div');
    box.className = 'box';
    box.hidden = true;
    label = doc.createElement('div');
    label.className = 'label';
    label.hidden = true;
    root.append(style, box, label);
    doc.documentElement.appendChild(host);
  };

  return {
    show(rect, text) {
      ensure();
      box!.hidden = false;
      label!.hidden = false;
      Object.assign(box!.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const [name, rest] = text.split('\u0000');
      const strong = doc.createElement('b');
      strong.textContent = name;
      label!.replaceChildren(strong, doc.createTextNode(rest ? ` ${rest}` : ''));
      const below = rect.top < 28;
      label!.style.left = `${Math.max(4, rect.left)}px`;
      label!.style.top = below ? `${rect.top + rect.height + 4}px` : `${rect.top - 24}px`;
    },
    hide() {
      if (box) box.hidden = true;
      if (label) label.hidden = true;
    },
    dispose() {
      host?.remove();
      host = box = label = null;
    },
  };
}
