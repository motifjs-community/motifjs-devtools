import { Component, FromService, effect, untracked } from '@motifx/core';
import { ICONS } from '../icons';
import { DevtoolsModel } from '../model/DevtoolsModel';
import { ExtensionsModel, type PanelRecord } from '../model/ExtensionsModel';
import { buildWidget } from '../widgets';

const REASONS: Record<string, string> = {
  'panels-too-large': 'The panel metadata is over the limit (256 KB, 2000 widgets or 32 levels) and was refused as a whole.',
  'no extension': 'The package is no longer registered.',
};

const reason = (error: string) => REASONS[error] ?? error;

/** Holds the widget tree of the open panel and builds it again when the panel or its layout changes. */
class WidgetHost extends Component<HTMLDivElement> {
  model = FromService(ExtensionsModel)!;
  devtools = FromService(DevtoolsModel)!;
  private shown = '';

  override onConfigured() {
    this.class.add('dt-ext-body');
  }

  override onBuilt() {
    const stop = effect(() => {
      const panel = this.model.activePanel(this.devtools.state.section);
      const key = panel === null || panel.layout === null ? '' : `${panel.key}#${panel.version}`;
      if (key === this.shown) return;
      this.shown = key;
      untracked(() => this.show(panel));
    });
    this.motif.setDisposable(stop);
  }

  private show(panel: PanelRecord | null) {
    this.controls.clear();
    if (panel === null || panel.layout === null) return;
    this.controls.add(buildWidget(panel.layout, { panel, model: this.model, build: buildWidget }));
  }
}

export class ExtensionPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  model = FromService(ExtensionsModel)!;
  devtools = FromService(DevtoolsModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-extension');
  }

  panel = () => this.model.activePanel(this.devtools.state.section);

  error = () => {
    const panel = this.panel();
    if (panel === null) return 'This panel is gone; the package may have been disposed.';
    const record = this.model.state.extensions.find((item) => item.name === panel.name);
    return [record?.error ?? null, panel.error].filter((part): part is string => part !== null).map(reason).join(' ');
  };

  notice = () => this.panel()?.notice ?? '';

  dropped = () => {
    const panel = this.panel();
    return panel === null ? 0 : (this.model.state.extensions.find((item) => item.name === panel.name)?.dropped ?? 0);
  };

  refresh() {
    const panel = this.panel();
    if (panel !== null) this.model.refresh(panel);
  }

  override view() {
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>{() => (this.panel()?.name ?? '').toUpperCase()}</small>
            <h1>{() => this.panel()?.title ?? ''}</h1>
          </div>
          <div class="dt-page-actions">
            <span class="dt-ext-dropped" title="Events the package sent faster than the bridge forwards (1000 a second); the panel did not see them" x-display={() => this.dropped() > 0}>
              {() => `${this.dropped().toLocaleString('en-US')} events dropped`}
            </span>
            <span class="dt-ext-writes" title="Commands of this panel change the app" x-display={() => this.panel()?.capabilities.write === true}>
              <span x-html={ICONS.pen}></span>
              changes the app
            </span>
            <button type="button" class="dt-button" onclick={() => this.refresh()}>
              <span class="dt-button-icon" x-html={ICONS.refresh}></span>
              Refresh
            </button>
          </div>
        </header>
        <div class="dt-ext-notice" role="status" x-display={() => this.notice() !== ''}>
          {() => this.notice()}
        </div>
        <div class="dt-empty small dt-ext-error" x-display={() => this.error() !== ''}>
          {() => this.error()}
        </div>
        <WidgetHost />
      </>
    );
  }
}
