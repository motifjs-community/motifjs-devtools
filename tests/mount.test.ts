import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type DevtoolsHandle } from '../src/inpage/mount';
import { CHANNEL } from '../src/bridge/protocol';

let handle: DevtoolsHandle | null = null;

const shadow = () => document.querySelector('motif-devtools')!.shadowRoot!;
const dockElement = () => shadow().querySelector<HTMLElement>('.dock')!;
const frame = () => shadow().querySelector('iframe')!;
const fromFrame = (data: unknown, source: unknown = frame().contentWindow) =>
  window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  handle?.dispose();
  handle = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('mount', () => {
  it('adds one host with a toggle button and opens at the bottom by default', () => {
    handle = mount({ html: '<p>panel</p>' });
    expect(mount()).toBe(handle);
    expect(document.querySelectorAll('motif-devtools')).toHaveLength(1);
    expect(dockElement().hidden).toBe(true);
    shadow().querySelector<HTMLButtonElement>('.toggle')!.click();
    expect(handle.isOpen).toBe(true);
    expect(dockElement().hidden).toBe(false);
    expect(dockElement().dataset.position).toBe('bottom');
    expect(frame().getAttribute('srcdoc')).toBe('<p>panel</p>');
  });

  it('docks to the right and remembers the position', () => {
    handle = mount({ html: '', open: true });
    handle.dock('right');
    expect(dockElement().dataset.position).toBe('right');
    expect(JSON.parse(localStorage.getItem('motif-devtools:dock')!).position).toBe('right');
    handle.dispose();
    handle = mount({ html: '', open: true });
    expect(handle.position).toBe('right');
    expect(dockElement().dataset.position).toBe('right');
  });

  it('follows dock requests from the panel frame only', () => {
    handle = mount({ html: '', open: true });
    fromFrame({ channel: CHANNEL, kind: 'dock', position: 'right' }, window);
    expect(handle.position).toBe('bottom');
    fromFrame({ channel: CHANNEL, kind: 'dock', position: 'right' });
    expect(handle.position).toBe('right');
    fromFrame({ channel: CHANNEL, kind: 'dock', position: 'left' });
    expect(handle.position).toBe('right');
  });

  it('tells the panel where it is docked when the panel says hello', () => {
    handle = mount({ html: '', open: true });
    const post = vi.spyOn(frame().contentWindow!, 'postMessage');
    fromFrame({ channel: CHANNEL, kind: 'hello' });
    expect(post).toHaveBeenCalledWith({ channel: CHANNEL, kind: 'dock', position: 'bottom' }, expect.anything());
  });

  it('stays docked when the browser blocks the separate window', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    handle = mount({ html: '', open: true });
    handle.dock('window');
    expect(handle.position).toBe('bottom');
    expect(dockElement().hidden).toBe(false);
  });

  it('moves to a separate window and docks back when it is closed', () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const popup = {
      closed: false,
      focus: vi.fn(),
      close() {
        this.closed = true;
      },
      postMessage: vi.fn(),
      document: { open: vi.fn(), write: (html: string) => written.push(html), close: vi.fn() },
    };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    handle = mount({ html: '<p>panel</p>', open: true });
    handle.dock('right');
    handle.dock('window');
    expect(handle.position).toBe('window');
    expect(dockElement().hidden).toBe(true);
    expect(written).toEqual(['<p>panel</p>']);
    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(handle.position).toBe('right');
    expect(dockElement().hidden).toBe(false);
  });
});
