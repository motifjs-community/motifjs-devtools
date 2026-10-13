import { createBridge, type Bridge } from '../bridge/bridge';
import { CHANNEL, isBridgeMessage, type BridgeMessage, type DockPosition } from '../bridge/protocol';
import { HOST_STYLES, LOGO_SVG } from './host-styles';

export interface MountOptions {
  src?: string;
  html?: string;
  open?: boolean;
  position?: DockPosition;
}

export interface DevtoolsHandle {
  readonly isOpen: boolean;
  readonly position: DockPosition;
  open(): void;
  close(): void;
  toggle(): void;
  dock(position: DockPosition): void;
  dispose(): void;
}

type Saved = { position: DockPosition; height: number; width: number };

const HOST_TAG = 'motif-devtools';
const STORAGE_KEY = 'motif-devtools:dock';
const WINDOW_NAME = 'motif-devtools';
const MIN_SIZE = 160;
let current: DevtoolsHandle | null = null;

const readSaved = (): Partial<Saved> => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
};

const isPosition = (value: unknown): value is DockPosition => value === 'bottom' || value === 'right' || value === 'window';

export function mount(options: MountOptions = {}): DevtoolsHandle {
  if (current !== null) return current;

  const saved = readSaved();
  const state: Saved = {
    position: options.position ?? (isPosition(saved.position) ? saved.position : 'bottom'),
    height: typeof saved.height === 'number' ? saved.height : Math.round(window.innerHeight * 0.45),
    width: typeof saved.width === 'number' ? saved.width : 520,
  };
  let docked: Exclude<DockPosition, 'window'> = state.position === 'right' ? 'right' : 'bottom';
  let isOpen = false;
  let popup: Window | null = null;
  let popupWatch: ReturnType<typeof setInterval> | null = null;
  let frameLoaded = false;

  const host = document.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${HOST_STYLES}</style>`;

  const toggleButton = document.createElement('button');
  toggleButton.className = 'toggle';
  toggleButton.type = 'button';
  toggleButton.title = 'MotifJS DevTools';
  toggleButton.setAttribute('aria-label', 'MotifJS DevTools');
  toggleButton.innerHTML = LOGO_SVG;

  const dockElement = document.createElement('div');
  dockElement.className = 'dock';
  dockElement.hidden = true;
  const resizer = document.createElement('div');
  resizer.className = 'resizer';
  const frame = document.createElement('iframe');
  frame.title = 'MotifJS DevTools';
  dockElement.append(resizer, frame);
  root.append(toggleButton, dockElement);

  const origin = location.origin === 'null' ? '*' : location.origin;
  const target = (): Window | null => (popup !== null && !popup.closed ? popup : frame.contentWindow);
  const post = (message: BridgeMessage) => target()?.postMessage(message, origin);
  let bridge: Bridge | null = null;

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  };

  const clamp = (value: number, max: number) => Math.max(MIN_SIZE, Math.min(max, value));

  const layout = () => {
    const visible = isOpen && state.position !== 'window';
    dockElement.hidden = !visible;
    dockElement.dataset.position = docked;
    host.dataset.position = docked;
    host.dataset.open = String(visible);
    toggleButton.classList.toggle('active', isOpen);
    const height = clamp(state.height, window.innerHeight - 40);
    const width = clamp(state.width, window.innerWidth - 40);
    dockElement.style.height = docked === 'bottom' ? `${height}px` : '';
    dockElement.style.width = docked === 'right' ? `${width}px` : '';
    host.style.setProperty('--dock-height', `${height}px`);
    host.style.setProperty('--dock-width', `${width}px`);
  };

  const announce = () => post({ channel: CHANNEL, kind: 'dock', position: state.position });

  const loadPanel = (into: 'frame' | Window) => {
    if (into === 'frame') {
      if (frameLoaded) return;
      frameLoaded = true;
      if (options.src) frame.src = options.src;
      else frame.srcdoc = options.html ?? '';
      return;
    }
    if (!options.src) {
      into.document.open();
      into.document.write(options.html ?? '');
      into.document.close();
    }
  };

  const unloadFrame = () => {
    if (!frameLoaded) return;
    frameLoaded = false;
    frame.removeAttribute('srcdoc');
    frame.src = 'about:blank';
  };

  const stopWatchingPopup = () => {
    if (popupWatch !== null) clearInterval(popupWatch);
    popupWatch = null;
  };

  const openWindow = (): boolean => {
    if (popup !== null && !popup.closed) {
      popup.focus();
      return true;
    }
    const features = `popup,width=${Math.min(1200, screen.availWidth)},height=${Math.min(800, screen.availHeight)}`;
    const opened = window.open(options.src ?? 'about:blank', WINDOW_NAME, features);
    if (opened === null) return false;
    popup = opened;
    loadPanel(opened);
    popupWatch = setInterval(() => {
      if (popup === null || popup.closed) {
        stopWatchingPopup();
        popup = null;
        if (state.position === 'window') {
          state.position = docked;
          save();
          if (isOpen) {
            loadPanel('frame');
            announce();
          }
          layout();
        }
      }
    }, 400);
    return true;
  };

  const closeWindow = () => {
    stopWatchingPopup();
    if (popup !== null && !popup.closed) popup.close();
    popup = null;
  };

  const ensureBridge = () => {
    if (bridge !== null) return;
    bridge = createBridge({ send: post });
    window.addEventListener('message', onMessage);
  };

  const onMessage = (event: MessageEvent) => {
    if (bridge === null || !isBridgeMessage(event.data)) return;
    const fromPopup = popup !== null && event.source === popup;
    if (!fromPopup && event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message.kind === 'dock') {
      if (isPosition(message.position)) handle.dock(message.position);
      return;
    }
    if (message.kind === 'hello') announce();
    bridge.receive(message);
  };

  const startResize = (down: PointerEvent) => {
    down.preventDefault();
    resizer.setPointerCapture(down.pointerId);
    frame.style.pointerEvents = 'none';
    const move = (event: PointerEvent) => {
      if (docked === 'bottom') state.height = clamp(window.innerHeight - event.clientY, window.innerHeight - 40);
      else state.width = clamp(window.innerWidth - event.clientX, window.innerWidth - 40);
      layout();
    };
    const up = () => {
      frame.style.pointerEvents = '';
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
      resizer.removeEventListener('pointercancel', up);
      save();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
    resizer.addEventListener('pointercancel', up);
  };
  resizer.addEventListener('pointerdown', startResize);

  const handle: DevtoolsHandle = {
    get isOpen() {
      return isOpen;
    },
    get position() {
      return state.position;
    },
    open() {
      ensureBridge();
      isOpen = true;
      if (state.position === 'window') {
        if (!openWindow()) {
          state.position = docked;
          loadPanel('frame');
        }
      } else {
        loadPanel('frame');
      }
      layout();
    },
    close() {
      isOpen = false;
      closeWindow();
      if (state.position === 'window') state.position = docked;
      layout();
    },
    toggle() {
      if (isOpen && state.position === 'window' && popup !== null && !popup.closed) popup.focus();
      else if (isOpen) handle.close();
      else handle.open();
    },
    dock(position) {
      if (position === state.position && (position !== 'window' || popup !== null)) return;
      if (position === 'window') {
        state.position = 'window';
        if (isOpen && openWindow()) unloadFrame();
        else if (isOpen) state.position = docked;
      } else {
        docked = position;
        const wasWindow = state.position === 'window';
        state.position = position;
        if (wasWindow) closeWindow();
        if (isOpen) loadPanel('frame');
      }
      save();
      layout();
      announce();
    },
    dispose() {
      window.removeEventListener('message', onMessage);
      closeWindow();
      bridge?.dispose();
      bridge = null;
      host.remove();
      if (current === handle) current = null;
    },
  };

  toggleButton.addEventListener('click', () => handle.toggle());
  document.body.appendChild(host);
  current = handle;
  layout();
  if (options.open) handle.open();
  return handle;
}
