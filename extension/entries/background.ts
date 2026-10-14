import { extensionApi } from '../src/api';
import { startRouter } from '../src/router';

startRouter(extensionApi() as never);
