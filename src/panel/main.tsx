import { Application, effect } from '@motifx/core';
import { createClient } from '../client/client';
import { windowPort } from '../transport/window';
import { DevtoolsModel } from './model/DevtoolsModel';
import { Shell } from './Shell';
import './styles/panel.css';
import './styles/elements.css';

const peer = () => (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null);
const model = new DevtoolsModel(createClient(windowPort(window, peer)));

effect(() => {
  const theme = model.state.theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
});

const builder = Application.CreateBuilder();
builder.services.addSingleton(DevtoolsModel, { useValue: model });
builder.build().run('#app', new Shell());
