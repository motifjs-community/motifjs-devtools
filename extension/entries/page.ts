import { startPageBridge } from '../src/pageBridge';

startPageBridge(window as unknown as Window & Record<string, unknown>);
