import { extensionApi } from '../src/api';
import { startContentRelay } from '../src/relay';

startContentRelay(window, extensionApi().runtime);
