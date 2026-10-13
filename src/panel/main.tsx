import { Application, effect } from '@motifx/core';
import { createClient } from '../client/client';
import { windowPort } from '../transport/window';
import { DevtoolsModel } from './model/DevtoolsModel';
import { LogsModel } from './model/LogsModel';
import { ReactivityModel } from './model/ReactivityModel';
import { RouterModel } from './model/RouterModel';
import { Shell } from './Shell';
import './styles/panel.css';
import './styles/elements.css';
import './styles/reactivity.css';
import './styles/router.css';
import './styles/logs.css';

const peer = () => (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null);
const client = createClient(windowPort(window, peer));
const model = new DevtoolsModel(client);
const reactivity = new ReactivityModel(client);
const router = new RouterModel(client);
const logs = new LogsModel(client);

effect(() => {
  const theme = model.state.theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
});

const builder = Application.CreateBuilder();
builder.services.addSingleton(DevtoolsModel, { useValue: model });
builder.services.addSingleton(ReactivityModel, { useValue: reactivity });
builder.services.addSingleton(RouterModel, { useValue: router });
builder.services.addSingleton(LogsModel, { useValue: logs });
builder.build().run('#app', new Shell());
