import type { Detection } from '../src/messages';

const status = document.querySelector<HTMLElement>('#status')!;
const detail = document.querySelector<HTMLElement>('#detail')!;

const show = (found: boolean, text: string, note: string) => {
  document.body.dataset.found = String(found);
  status.textContent = text;
  detail.textContent = note;
};

const probe = (): Detection => {
  const api = (window as unknown as { __MOTIF_DEVTOOLS__?: { on?: unknown; version?: unknown; coreVersion?: unknown } }).__MOTIF_DEVTOOLS__;
  const found = typeof api === 'object' && api !== null && typeof api.on === 'function';
  return {
    found,
    version: found && typeof api.version === 'number' ? api.version : null,
    coreVersion: found && typeof api.coreVersion === 'string' ? api.coreVersion : null,
  };
};

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return show(false, 'No page', 'Open a page that runs a MotifJS app.');
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: probe });
    const detection = result?.result;
    if (detection?.found) show(true, `MotifJS ${detection.coreVersion ?? ''}`.trim(), 'Open DevTools (F12) and choose the MotifJS tab.');
    else show(false, 'MotifJS not found', 'This page has no MotifJS app in development mode. Call app.useDevelopment(true) while developing.');
  } catch {
    show(false, 'Not available here', 'Browser pages and the extension gallery cannot be inspected.');
  }
}

void main();
