import { reactive } from '@motifx/core';
import { formatValue } from '../format';
import { iconOf } from '../icons';
import type { BadgeWidget, ButtonWidget, CodeWidget, CounterWidget, JsonWidget, TextWidget, Widget } from '../schema';
import { PropNode } from '../ValueTree';
import { localTree } from '../ValueTreeSource';
import { ReadingView, WidgetView, countOf, formatText, toneClass, type ViewClass } from './base';

class TextView extends ReadingView<TextWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add(`dt-w-text${toneClass(this.widget.tone)}`);
  }

  text = () => {
    if (this.widget.source === undefined) return this.widget.text ?? '';
    const value = this.value();
    if (value === undefined || value === null || value === '') return this.loading() ? '…' : (this.widget.empty ?? '');
    return formatText(value, this.widget.format);
  };

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <span class="dt-w-value">{() => this.text()}</span>
        <span class="dt-w-error" x-display={() => this.error() !== ''}>{() => this.error()}</span>
      </>
    );
  }
}

class CounterView extends ReadingView<CounterWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add(`dt-w-counter${toneClass(this.widget.tone)}`);
  }

  count = () => {
    const count = countOf(this.value());
    return Number.isNaN(count) ? (this.loading() ? '…' : '–') : formatText(count, this.widget.format ?? 'number');
  };

  override view() {
    return (
      <>
        <b class="dt-w-count">{() => this.count()}</b>
        <small class="dt-w-label">{this.widget.label}</small>
        <span class="dt-w-error" x-display={() => this.error() !== ''}>{() => this.error()}</span>
      </>
    );
  }
}

class BadgeView extends ReadingView<BadgeWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-badge');
  }

  text = () => (this.widget.source === undefined ? (this.widget.text ?? '') : formatText(this.value(), this.widget.format));

  tone = () => {
    const text = this.widget.source === undefined ? (this.widget.text ?? '') : formatText(this.value(), undefined);
    return this.widget.tones?.[text] ?? this.widget.tone;
  };

  override view() {
    return (
      <span class={() => `dt-chip${toneClass(this.tone())}`} x-display={() => this.text() !== ''}>
        {() => this.text()}
      </span>
    );
  }
}

class JsonView extends ReadingView<JsonWidget> {
  readonly tree = localTree(() => this.value());

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-json');
  }

  entries = () => this.tree.entries();

  emptyText = () => {
    if (this.error() !== '') return this.error();
    if (this.loading()) return 'Loading…';
    const value = this.value();
    if (value !== undefined && value !== null && typeof value !== 'object') return formatValue(value).text;
    return this.widget.empty ?? 'Nothing to show';
  };

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.entries().length === 0}>
          {() => this.emptyText()}
        </div>
        {this.entries().map((entry) => (
          <PropNode key={`${entry.key}:${JSON.stringify(entry.value) ?? ''}`} name={entry.key} value={entry.value} keys={[entry.key]} source={this.tree} />
        ))}
      </>
    );
  }
}

const lines = (text: string) => text.split('\n').map((line, index) => ({ key: index, line }));

class CodeView extends ReadingView<CodeWidget> {
  readonly copy = reactive({ done: false });

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-code');
  }

  text = () => {
    if (this.widget.source === undefined) return this.widget.text ?? '';
    const value = this.value();
    if (value === undefined || value === null) return '';
    if (this.widget.language === 'json' || typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  rows = () => lines(this.text());

  copyText() {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard === undefined) return;
    void clipboard.writeText(this.text()).then(() => {
      this.copy.done = true;
      setTimeout(() => (this.copy.done = false), 1200);
    });
  }

  override view() {
    return (
      <>
        <div class="dt-code-head">
          <small class="dt-w-title">{this.widget.title ?? (this.widget.language === 'json' ? 'JSON' : 'Text')}</small>
          <button type="button" class="dt-button small" onclick={() => this.copyText()} x-display={() => this.text() !== ''}>
            {() => (this.copy.done ? 'Copied' : 'Copy')}
          </button>
        </div>
        <div class="dt-w-empty dt-muted" x-display={() => this.text() === ''}>
          {() => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'Nothing to show'))}
        </div>
        <pre class="dt-code" x-display={() => this.text() !== ''}>
          {this.rows().map((row) => (
            <span key={row.key} class="dt-code-line">
              {row.line}
            </span>
          ))}
        </pre>
      </>
    );
  }
}

export class ButtonView extends WidgetView<ButtonWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-button');
  }

  busy = () => this.widget.command !== undefined && this.scope.panel.busy === this.widget.command;
  // going to a route changes nothing in the app; a command needs the panel's write
  allowed = () => this.widget.navigate !== undefined || this.scope.panel.capabilities.write;

  override view() {
    const icon = this.widget.icon === undefined ? '' : iconOf(this.widget.icon, 'play');
    return (
      <button
        type="button"
        class={() => `dt-button${toneClass(this.widget.tone)}${this.busy() ? ' busy' : ''}`}
        disabled={() => this.busy() || !this.allowed()}
        title={() => (this.allowed() ? (this.widget.confirm ?? '') : 'This panel may not run commands')}
        onclick={() => void this.scope.model.run(this.scope.panel, this.widget)}
      >
        <span class="dt-button-icon" x-html={icon} x-display={() => icon !== ''}></span>
        {this.widget.label}
      </button>
    );
  }
}

export class UnknownView extends WidgetView<Widget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-unknown');
  }

  override view() {
    return <span>{`A "${this.widget.type}" widget is not supported by this version of the panel.`}</span>;
  }
}

export const simpleViews: Record<string, ViewClass> = { text: TextView, counter: CounterView, badge: BadgeView, json: JsonView, code: CodeView, button: ButtonView };
