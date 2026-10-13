import { Component, FromService, reactive } from '@motifx/core';
import { Hint, PageHead } from '../layout';
import { ThemeService } from '../services';
import { session } from '../stores';

export class SettingsPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  themes = FromService(ThemeService)!;
  prefs = reactive({ compact: false, pageSize: 20, language: 'en' });

  override view() {
    const prefs = this.prefs;
    return (
      <>
        <PageHead title="Settings" text="The theme is a signal in ThemeService; the preferences are a reactive field of this page." />
        <div class="card form">
          <label class="check">
            <input type="checkbox" checked={() => this.themes.theme.value === 'dark'} onchange={() => this.themes.toggle()} />
            Dark theme
          </label>
          <label class="check">
            <input type="checkbox" checked={() => prefs.compact} onchange={() => (prefs.compact = !prefs.compact)} />
            Compact rows
          </label>
          <label class="field">
            Page size
            <input type="number" min="5" max="100" value={() => String(prefs.pageSize)} oninput={(e) => (prefs.pageSize = Number((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="field">
            Language
            <select value={() => prefs.language} onchange={(e) => (prefs.language = (e.target as HTMLSelectElement).value)}>
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label class="check warn">
            <input type="checkbox" checked={() => session.unsaved} onchange={() => (session.unsaved = !session.unsaved)} />
            I have unsaved changes (leaving this page is then cancelled)
          </label>
        </div>
        <Hint
          screens="Stores, Services, Router"
          points={[
            'Stores: SettingsPage.prefs is listed under this component. Edit pageSize or language there and the form follows.',
            'Stores and Services: ThemeService.theme is a signal shown by its value, signal("light"). Toggle the theme to see it change.',
            'Router: tick "unsaved changes" and click another page. The navigation is cancelled with the reason "unsaved changes".',
            'Routes tab: this route shows its onLeave hook.',
          ]}
        />
      </>
    );
  }
}
