import { Application, effect } from '@motifx/core';
import { createClient, type Port } from '../client/client';
import { DevtoolsModel, type ShownSource } from './model/DevtoolsModel';
import { LogsModel } from './model/LogsModel';
import { ReactivityModel } from './model/ReactivityModel';
import { RouterModel } from './model/RouterModel';
import { StoresModel } from './model/StoresModel';
import { ServicesModel } from './model/ServicesModel';
import { HomeModel } from './model/HomeModel';
import { PerformanceModel } from './model/PerformanceModel';
import { Shell } from './Shell';
import './styles/panel.css';
import './styles/elements.css';
import './styles/reactivity.css';
import './styles/router.css';
import './styles/logs.css';
import './styles/stores.css';
import './styles/services.css';
import './styles/home.css';
import './styles/performance.css';

export type PanelOptions = { systemTheme?: () => 'light' | 'dark' | null; shown?: ShownSource };

export function startPanel(port: Port, options: PanelOptions = {}) {
  const client = createClient(port);
  const model = new DevtoolsModel(client, { shown: options.shown });
  const shown = () => model.state.shown;
  const reactivity = new ReactivityModel(client);
  const router = new RouterModel(client, () => shown() && model.state.section === 'router');
  const logs = new LogsModel(client, undefined, () => shown() && model.state.section === 'logs');
  const stores = new StoresModel(client, () => model.state.section === 'stores' || model.state.section === 'performance' || model.state.section === 'reactivity', undefined, undefined, shown);
  const services = new ServicesModel(client, () => model.state.section === 'services', undefined, undefined, shown);
  const performance = new PerformanceModel(client, () => model.state.counters, undefined, undefined, shown);
  const home = new HomeModel(client, () => model.state.section === 'home', undefined, shown);

  effect(() => {
    if (!model.state.shown) return;
    void model.state.section;
    queueMicrotask(() => {
      for (const reader of [router, logs, stores, services, home]) reader.wake();
    });
  });

  effect(() => {
    if (model.state.section === 'home' && model.state.status.connected) void home.load();
  });

  effect(() => {
    const section = model.state.section;
    if ((section === 'stores' || section === 'performance' || section === 'reactivity') && model.state.status.connected) void stores.load();
  });

  effect(() => {
    if (model.state.section === 'services' && model.state.status.connected) void services.load();
  });

  effect(() => {
    const theme = model.state.theme === 'system' ? options.systemTheme?.() ?? null : model.state.theme;
    if (theme === null) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: model });
  builder.services.addSingleton(ReactivityModel, { useValue: reactivity });
  builder.services.addSingleton(RouterModel, { useValue: router });
  builder.services.addSingleton(LogsModel, { useValue: logs });
  builder.services.addSingleton(StoresModel, { useValue: stores });
  builder.services.addSingleton(ServicesModel, { useValue: services });
  builder.services.addSingleton(HomeModel, { useValue: home });
  builder.services.addSingleton(PerformanceModel, { useValue: performance });
  builder.build().run('#app', new Shell());
  return client;
}
