import { Application, type RouteItem } from '@motifx/core';
import { mount } from '@motifx-community/devtools';
import { AppShell } from './layout';
import { CartPage } from './pages/CartPage';
import { Dashboard } from './pages/Dashboard';
import { LabPage } from './pages/LabPage';
import { OrderPage } from './pages/OrderPage';
import { DailyReport, Reports, WeeklyReport } from './pages/Reports';
import { SettingsPage } from './pages/SettingsPage';
import { ApiClient, CartService, DialogState, OrderDraft, PriceFormatter, ThemeService } from './services';
import { session } from './stores';
import { toast } from './toasts';
import './styles.css';

const routes: RouteItem[] = [
  {
    path: '/',
    control: AppShell,
    childs: [
      { path: '/', redirect: '/dashboard' },
      { path: '/dashboard', name: 'dashboard', control: Dashboard, keepAlive: true },
      {
        path: '/orders/{id}',
        name: 'order',
        control: OrderPage,
        validate: (e) => /^\d+$/.test(String(e.params.id)),
      },
      { path: '/cart', name: 'cart', control: CartPage },
      {
        path: '/settings',
        name: 'settings',
        control: SettingsPage,
        onLeave: () => (session.unsaved ? { cancel: true, reason: 'unsaved changes' } : undefined),
      },
      { path: '/lab', name: 'lab', control: LabPage, meta: { title: 'Lab' } },
      {
        path: '/reports',
        name: 'reports',
        control: Reports,
        alias: '/analytics',
        meta: { title: 'Reports', section: 'analytics' },
        childs: [
          { path: '/', redirect: '/reports/daily' },
          { path: '/daily', name: 'reports.daily', control: DailyReport, meta: { range: 'day' } },
          { path: '/weekly', name: 'reports.weekly', control: WeeklyReport, meta: { range: 'week' } },
        ],
      },
      { path: '/login', redirect: '/dashboard' },
      {
        path: '/broken',
        control: () => {
          throw new Error('The orders service is not available');
        },
      },
      { path: '/loop', redirect: '/loop-back' },
      { path: '/loop-back', redirect: '/loop' },
    ],
    onEnter: () => toast('Welcome to Motif Shop'),
  },
];

const builder = Application.CreateBuilder();
builder.services.addSingleton(ThemeService, ThemeService);
builder.services.addSingleton(CartService, CartService);
builder.services.addSingleton(ApiClient, ApiClient);
builder.services.addScoped(OrderDraft, OrderDraft);
builder.services.addScoped(DialogState, DialogState);
builder.services.addTransient(PriceFormatter, PriceFormatter);
const app = builder.build();
app.useDevelopment(true);
app.useRouter({ routes, mode: 'hash' });
app.run('#app');

mount();
