import { startPanel } from '../../src/panel/start';
import { extensionApi } from '../src/api';
import { panelPort } from '../src/panelPort';

const params = new URLSearchParams(location.search);
const theme = params.get('theme');

startPanel(panelPort(extensionApi().runtime, Number(params.get('tabId'))), {
  systemTheme: () => (theme === 'dark' ? 'dark' : theme === null ? null : 'light'),
});
