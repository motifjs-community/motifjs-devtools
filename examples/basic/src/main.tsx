import { Application, Component, reactive } from '@motifx/core';
import { mount } from '@motifx-community/devtools';

const store = reactive({
  stats: [
    { id: 1, title: 'Total revenue', value: 24780, trend: 12.5 },
    { id: 2, title: 'Orders', value: 342, trend: -3.1 },
    { id: 3, title: 'Customers', value: 1290, trend: 4.2 },
  ],
  orders: [
    { id: 1042, customer: 'Ada', total: 120 },
    { id: 1043, customer: 'Linus', total: 64 },
  ],
  signedIn: false,
});

function StatCard(props: { stat: { title: string; value: number; trend: number } }) {
  return (
    <article class={() => `card ${props.stat.trend >= 0 ? 'positive' : 'negative'}`}>
      <small>{props.stat.title}</small>
      <div>{() => props.stat.value.toLocaleString('en-US')}</div>
      <b>{() => `${props.stat.trend > 0 ? '+' : ''}${props.stat.trend}%`}</b>
    </article>
  );
}

function UserMenu() {
  return <button type="button">Signed in</button>;
}

class Dashboard extends Component<HTMLElement> {
  static override elementTag = 'section';

  addOrder() {
    const id = store.orders.length + 1042;
    store.orders.push({ id, customer: `Customer ${id}`, total: Math.round(Math.random() * 200) });
    store.stats[1].value++;
    store.stats[0].value += store.orders[store.orders.length - 1].total;
  }

  override view() {
    return (
      <>
        <div class="stats">
          {store.stats.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </div>
        <div>
          <button type="button" onclick={() => this.addOrder()}>Add order</button>
        </div>
        <table>
          <tbody>
            {store.orders.map((order) => (
              <tr key={order.id}>
                <td>{`#${order.id}`}</td>
                <td>{order.customer}</td>
                <td>{() => order.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
}

function AppShell() {
  return (
    <div>
      <header>
        <b>Motif App</b>
        <nav>
          <a href="#dashboard">Dashboard</a>
          <a href="#orders">Orders</a>
        </nav>
        <button type="button" onclick={() => (store.signedIn = !store.signedIn)}>Toggle sign-in</button>
        <UserMenu x-wait={() => !store.signedIn} />
      </header>
      <main>
        <Dashboard />
      </main>
    </div>
  );
}

const app = Application.CreateBuilder().build();
app.useDevelopment(true);
app.run('#app', <AppShell />);

mount({ src: './panel.html', open: true });
