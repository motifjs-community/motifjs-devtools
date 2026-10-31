import { Application } from '@motifx/core';
import { RequestError, type Client, type ClientEvent, type ClientStatus } from '../src/client/client';
import { DevtoolsModel, type Section } from '../src/panel/model/DevtoolsModel';
import { ExtensionsModel } from '../src/panel/model/ExtensionsModel';
import { ExtensionPage } from '../src/panel/pages/ExtensionPage';
import { idleClient, tick } from './helpers';

export type FakeExtension = {
  panels?: unknown;
  sources?: Record<string, unknown>;
  commands?: string[];
  read?: (panel: string, source: string, params: Record<string, unknown>) => unknown;
  call?: (panel: string, command: string, args: Record<string, unknown>) => unknown;
  describe?: unknown;
  fail?: string;
};

export type FakePage = { extensions: Record<string, FakeExtension>; oldCore?: boolean };

export const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

export function fakeExtensionClient(page: FakePage) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: unknown[][] = [];
  const client: Client = {
    status: { connected: true, version: 2 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      // a real port clones the message; a reactive proxy among the arguments must fail here as it would there
      calls.push(structuredClone([method, ...args]));
      const [name, panel, target, extra] = args as [string, string, string, Record<string, unknown>];
      const extension = page.extensions[name];
      switch (method) {
        case 'getExtensions':
          return Object.keys(page.extensions) as T;
        case 'readExtensionPanels':
          if (page.oldCore) throw new RequestError('unknown-method');
          if (extension === undefined) return { ok: false, error: 'no extension' } as T;
          if (extension.fail !== undefined) return { ok: false, error: extension.fail } as T;
          return { ok: true, value: { panels: extension.panels ?? [], sources: extension.sources ?? {}, commands: extension.commands ?? [] } } as T;
        case 'readExtensionSource':
          return (extension?.read === undefined ? { ok: false, error: 'no source' } : { ok: true, value: extension.read(panel, target, extra) }) as T;
        case 'callExtension':
          try {
            return { ok: true, value: extension?.call?.(panel, target, extra) } as T;
          } catch (error) {
            return { ok: false, error: (error as Error).message } as T;
          }
        case 'readExtension':
          return extension?.describe as T;
        default:
          return null as T;
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus(listener) {
      statuses.add(listener);
      return () => statuses.delete(listener);
    },
    onDock: () => () => {},
    ...idleClient,
    setDock() {},
    dispose() {},
  };
  const emit = (event: ClientEvent) => {
    for (const listener of listeners) listener(event);
  };
  const reads = (source: string) => calls.filter((call) => call[0] === 'readExtensionSource' && call[3] === source).length;
  const describes = () => calls.filter((call) => call[0] === 'readExtension').length;
  return { client, emit, calls, reads, describes };
}

export type Rendered = ReturnType<typeof fakeExtensionClient> & { app: Application; devtools: DevtoolsModel; model: ExtensionsModel; root: HTMLElement };

const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

/** The page of one panel with a fake client; jsdom has no layout, so lists get a height to show rows. */
export async function renderPanel(page: FakePage, section: string): Promise<Rendered> {
  const fake = fakeExtensionClient(page);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = { connected: true, version: 2 };
  devtools.state.section = section as Section;
  const model = new ExtensionsModel(fake.client, () => devtools.state.section, 0);
  await model.load();
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(ExtensionsModel, { useValue: model });
  const app = builder.build();
  app.run('#app', new ExtensionPage());
  await settle();
  return { ...fake, app, devtools, model, root: document.querySelector('.dt-extension') as HTMLElement };
}

export async function cleanup(rendered: Rendered | null) {
  if (rendered === null) return;
  rendered.model.dispose();
  await rendered.app.dispose?.();
  document.body.innerHTML = '';
  if (clientHeight !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
}

export const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(text);

export const props = (root: ParentNode) => [...root.querySelectorAll('.dt-prop-row')].map((row) => `${text(row.querySelector('.dt-prop-key'))} ${text(row.querySelector('.dt-value'))}`);
