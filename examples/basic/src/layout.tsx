import { FromService, RouterLink, RouterView } from '@motifx/core';
import { CartService, ThemeService } from './services';
import { session } from './stores';
import { ToastHost } from './toasts';

type NavLink = { to: string; text: string };

const APP_LINKS: NavLink[] = [
  { to: '/dashboard', text: 'Dashboard' },
  { to: '/orders/1042', text: 'Order #1042' },
  { to: '/cart', text: 'Cart' },
  { to: '/settings', text: 'Settings' },
  { to: '/lab', text: 'Lab' },
];

const ROUTER_LINKS: NavLink[] = [
  { to: '/reports', text: 'Nested route' },
  { to: '/analytics/weekly', text: 'Alias' },
  { to: '/login', text: 'Redirect' },
  { to: '/missing', text: 'Not found' },
  { to: '/broken', text: 'Page error' },
  { to: '/loop', text: 'Redirect loop' },
];

export function Hint(props: { screens: string; points: string[] }) {
  return (
    <aside class="hint">
      <b>{`In DevTools · ${props.screens}`}</b>
      <ul>
        {props.points.map((point, index) => (
          <li key={index}>{point}</li>
        ))}
      </ul>
    </aside>
  );
}

export function PageHead(props: { title: string; text: string }) {
  return (
    <header class="page-head">
      <h1>{props.title}</h1>
      <p>{props.text}</p>
    </header>
  );
}

function NavGroup(props: { title: string; links: NavLink[] }) {
  return (
    <div class="nav-group">
      <small>{props.title}</small>
      {props.links.map((link) => (
        <RouterLink key={link.to} to={link.to} text={link.text} activeClass="active" />
      ))}
    </div>
  );
}

function UserMenu() {
  return <span class="user">Signed in as Ada</span>;
}

const signText = (signedIn: boolean) => (signedIn ? 'Sign out' : 'Sign in');
const themeLabel = (theme: string) => (theme === 'light' ? 'Dark theme' : 'Light theme');

export function AppShell() {
  const cart = FromService(CartService)!;
  const themes = FromService(ThemeService)!;
  return (
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <b>Motif Shop</b>
          <small>DevTools example</small>
        </div>
        <div class="topbar-actions">
          <a rel="router" href="/cart" class="cart-badge">
            {() => `Cart · ${cart.count.value}`}
          </a>
          <button type="button" onclick={() => themes.toggle()}>
            {() => themeLabel(themes.theme.value)}
          </button>
          <button type="button" onclick={() => (session.signedIn = !session.signedIn)}>
            {() => signText(session.signedIn)}
          </button>
          <UserMenu x-wait={() => !session.signedIn} />
        </div>
      </header>
      <nav class="sidebar">
        <NavGroup title="APP" links={APP_LINKS} />
        <NavGroup title="ROUTER CASES" links={ROUTER_LINKS} />
      </nav>
      <main class="content">
        <RouterView />
      </main>
      <ToastHost />
    </div>
  );
}
