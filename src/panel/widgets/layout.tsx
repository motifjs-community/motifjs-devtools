import { Component, effect, reactive } from '@motifx/core';
import type { SplitWidget, StackWidget, TabsWidget, ToolbarWidget } from '../schema';
import { WidgetView, host, type ViewClass } from './base';

class StackView extends WidgetView<StackWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-stack');
    if (this.widget.direction === 'row') this.class.add('row');
  }

  override onBuilt() {
    super.onBuilt();
    this.controls.add(...this.widget.children.map((child) => this.scope.build(child, this.scope)));
  }
}

class ToolbarView extends WidgetView<ToolbarWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-toolbar');
  }

  override onBuilt() {
    super.onBuilt();
    this.controls.add(...this.widget.children.map((child) => this.scope.build(child, this.scope)));
  }
}

const MIN_SHARE = 10;
const MAX_SHARE = 90;

/** Two widgets side by side or one above the other; the divider between them is dragged to change the share. */
class SplitView extends WidgetView<SplitWidget> {
  private share = 50;

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-split');
    if (this.widget.direction === 'column') this.class.add('column');
    const size = this.widget.size;
    if (typeof size === 'number' && Number.isFinite(size)) this.share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, size <= 1 ? size * 100 : size));
  }

  override onBuilt() {
    super.onBuilt();
    const first = host('dt-split-pane first');
    const second = host('dt-split-pane');
    const divider = new Component<HTMLDivElement>('div');
    divider.class.add('dt-split-divider');
    divider.attr.add({ role: 'separator', 'aria-orientation': this.widget.direction === 'column' ? 'horizontal' : 'vertical', tabindex: '0' });
    first.controls.add(this.scope.build(this.widget.primary, this.scope));
    second.controls.add(this.scope.build(this.widget.secondary, this.scope));
    this.controls.add(first, divider, second);
    this.apply();
    divider.motif.on('pointerdown', (_sender, e: PointerEvent) => this.drag(e, divider.element as HTMLElement));
    divider.motif.on('keydown', (_sender, e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -5 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 5 : 0;
      if (step === 0) return;
      e.preventDefault();
      this.set(this.share + step);
    });
  }

  private drag(start: PointerEvent, handle: HTMLElement) {
    const box = this.element.getBoundingClientRect();
    const column = this.widget.direction === 'column';
    const total = column ? box.height : box.width;
    if (total <= 0) return;
    start.preventDefault();
    handle.setPointerCapture(start.pointerId);
    const move = (e: PointerEvent) => this.set(((column ? e.clientY - box.top : e.clientX - box.left) / total) * 100);
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  private set(share: number) {
    this.share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, share));
    this.apply();
  }

  private apply() {
    this.element.style.setProperty('--dt-split', `${this.share}%`);
  }
}

/** Tabs over widgets; the open one is remembered in the panel's state when the widget names a key. */
class TabsView extends WidgetView<TabsWidget> {
  readonly local = reactive({ open: 0 });
  private panes: Component[] = [];

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-tabs');
  }

  open = () => {
    const key = this.widget.state;
    const value = key === undefined ? this.local.open : this.scope.panel.values[key];
    const index = typeof value === 'number' ? value : typeof value === 'string' ? this.widget.tabs.findIndex((tab) => tab.title === value) : 0;
    return index >= 0 && index < this.widget.tabs.length ? index : 0;
  };

  select(index: number) {
    if (this.widget.state === undefined) this.local.open = index;
    else this.scope.model.setValue(this.scope.panel, this.widget.state, index);
  }

  override onBuilt() {
    super.onBuilt();
    this.panes = this.widget.tabs.map((tab) => {
      const pane = host('dt-tabs-pane');
      pane.controls.add(this.scope.build(tab.layout, this.scope));
      return pane;
    });
    this.controls.add(...this.panes);
    const stop = effect(() => {
      const open = this.open();
      this.panes.forEach((pane, index) => (index === open ? pane.class.remove('dt-w-hidden') : pane.class.add('dt-w-hidden')));
    });
    this.motif.setDisposable(stop);
  }

  override view() {
    return (
      <div class="dt-tabs-strip" role="tablist">
        {this.widget.tabs.map((tab, index) => (
          <button key={index} type="button" role="tab" class={() => (this.open() === index ? 'dt-tab active' : 'dt-tab')} aria-selected={() => String(this.open() === index)} onclick={() => this.select(index)}>
            {tab.title}
          </button>
        ))}
      </div>
    );
  }
}

export const layoutViews: Record<string, ViewClass> = { stack: StackView, toolbar: ToolbarView, split: SplitView, tabs: TabsView };
