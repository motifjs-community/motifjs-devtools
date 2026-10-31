export type NavItem = { key: string; section: string; label: string; icon: string; order: number; builtin: boolean; writes: boolean; broken: boolean };

export type NavPanel = { key: string; title: string; icon: string; order: number; writes: boolean; broken: boolean };

const compare = (a: NavItem, b: NavItem) => a.order - b.order || Number(b.builtin) - Number(a.builtin) || a.label.localeCompare(b.label);

/**
 * One sidebar list out of the built-in sections and the panels of the packages, by order. An item made for a
 * panel is kept in `known` and updated in place, so a row keeps its identity when the list is rebuilt.
 */
export function mergeNavigation(builtin: readonly NavItem[], panels: readonly NavPanel[], known: Map<string, NavItem>): NavItem[] {
  const keys = new Set<string>();
  const items: NavItem[] = [...builtin];
  for (const panel of panels) {
    keys.add(panel.key);
    let item = known.get(panel.key);
    if (item === undefined) {
      item = { key: panel.key, section: panel.key, label: panel.title, icon: panel.icon, order: panel.order, builtin: false, writes: panel.writes, broken: panel.broken };
      known.set(panel.key, item);
    } else {
      item.label = panel.title;
      item.icon = panel.icon;
      item.order = panel.order;
      item.writes = panel.writes;
      item.broken = panel.broken;
    }
    items.push(item);
  }
  for (const key of [...known.keys()]) if (!keys.has(key)) known.delete(key);
  return items.sort(compare);
}
