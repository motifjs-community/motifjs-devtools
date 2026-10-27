declare namespace chrome {
  interface ChromeEvent<T extends (...args: never[]) => unknown> {
    addListener(listener: T): void;
    removeListener(listener: T): void;
  }

  namespace runtime {
    interface MessageSender {
      tab?: { id?: number };
      frameId?: number;
    }
    interface Port {
      name: string;
      sender?: MessageSender;
      postMessage(message: unknown): void;
      disconnect(): void;
      onMessage: ChromeEvent<(message: unknown, port: Port) => void>;
      onDisconnect: ChromeEvent<(port: Port) => void>;
    }
    const lastError: { message?: string } | undefined;
    function connect(info: { name: string }): Port;
    function sendMessage(message: unknown): Promise<unknown>;
    function getURL(path: string): string;
    const onConnect: ChromeEvent<(port: Port) => void>;
    const onMessage: ChromeEvent<(message: unknown, sender: MessageSender, respond: (response?: unknown) => void) => void | boolean>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
    }
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
    function query(info: { active: boolean; currentWindow: boolean }): Promise<Tab[]>;
    const onUpdated: ChromeEvent<(tabId: number, change: { status?: string }) => void>;
    const onRemoved: ChromeEvent<(tabId: number) => void>;
  }

  namespace scripting {
    function executeScript<T>(details: {
      target: { tabId: number };
      world?: 'MAIN' | 'ISOLATED';
      files?: string[];
      func?: () => T;
    }): Promise<{ result?: T }[]>;
  }

  namespace action {
    function setIcon(details: { tabId?: number; path: Record<string, string> }): Promise<void>;
    function setTitle(details: { tabId?: number; title: string }): Promise<void>;
  }

  namespace devtools {
    namespace inspectedWindow {
      const tabId: number;
      function eval<T>(expression: string, callback?: (result: T, exception?: unknown) => void): void;
    }
    namespace panels {
      interface ExtensionPanel {
        onShown: ChromeEvent<(window: Window) => void>;
        onHidden: ChromeEvent<() => void>;
      }
      const themeName: string;
      function create(title: string, iconPath: string, pagePath: string, callback?: (panel: ExtensionPanel) => void): void;
    }
    namespace network {
      const onNavigated: ChromeEvent<(url: string) => void>;
    }
  }
}

declare const browser: typeof chrome | undefined;
