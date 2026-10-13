import { RouterLink, RouterView } from '@motifx/core';
import { Hint, PageHead } from '../layout';

export function Reports() {
  return (
    <section>
      <PageHead title="Reports" text="A layout route with children. The child renders into the RouterView below." />
      <div class="tabs">
        <RouterLink to="/reports/daily" text="Daily" activeClass="active" />
        <RouterLink to="/reports/weekly" text="Weekly" activeClass="active" />
      </div>
      <div class="card">
        <RouterView />
      </div>
      <Hint
        screens="Router"
        points={[
          'Current tab: the chain shows /reports and then /reports/daily or /reports/weekly.',
          'Routes tab: /reports has a name, meta, the alias /analytics and two children with their own name and meta.',
          '"Alias" in the sidebar opens /analytics/weekly: the same pages answer to the alias, the address stays as typed.',
        ]}
      />
    </section>
  );
}

export function DailyReport() {
  return <p>Today: 3 orders, $394.00.</p>;
}

export function WeeklyReport() {
  return <p>This week: 21 orders, $2,310.00.</p>;
}
