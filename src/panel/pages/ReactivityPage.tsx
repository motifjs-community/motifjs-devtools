import { Component, FromService } from '@motifx/core';
import { formatValue } from '../format';
import { DevtoolsModel } from '../model/DevtoolsModel';
import { ReactivityModel, type Flush, type FlushEffect, type FlushTrigger } from '../model/ReactivityModel';

const integer = (value: number | undefined) => (value === undefined ? '–' : value.toLocaleString('en-US'));
const ms = (value: number | undefined) => (value === undefined ? '–' : `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ms`);
const pad = (value: number, size = 2) => String(value).padStart(size, '0');
const clock = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const triggerText = (trigger: FlushTrigger) => {
  const target = trigger.target as { kind?: string; type?: string } | null;
  const owner = target !== null && typeof target === 'object' && target.kind === 'object' ? target.type : formatValue(trigger.target).text;
  return `${owner}.${trigger.key}`;
};

const pauseText = (paused: boolean) => (paused ? '▶ Resume' : '❚❚ Pause');
const liveText = (paused: boolean) => (paused ? 'PAUSED' : 'LIVE');

const effectName = (effect: FlushEffect) => (effect.type === null ? 'detached' : effect.type === 'Component' ? `<${effect.tag}>` : effect.type);

function StatCard(props: { tone: string; label: string; value: () => string; note: () => string }) {
  return (
    <div class={`dt-card ${props.tone}`}>
      <small>{props.label}</small>
      <b>{() => props.value()}</b>
      <span>{() => props.note()}</span>
    </div>
  );
}

function FlushRow(props: { flush: Flush; model: ReactivityModel; devtools: DevtoolsModel }) {
  const { flush, model, devtools } = props;
  const open = () => model.state.expanded === flush.id;
  const width = () => {
    const max = model.maxDuration;
    return max === 0 ? 0 : Math.max(2, Math.round((flush.duration / max) * 100));
  };
  return (
    <div class={() => (open() ? 'dt-flush open' : 'dt-flush')}>
      <button type="button" class="dt-flush-row" onclick={() => model.toggle(flush.id)}>
        <span class="dt-mono dt-muted">{clock(flush.at)}</span>
        <b>{ms(flush.duration)}</b>
        <span>{String(flush.runs)}</span>
        <span>{String(flush.effects.length)}</span>
        <span class="dt-bar">
          <i style={() => `width: ${width()}%`}></i>
        </span>
      </button>
      <div class="dt-flush-detail" x-display={() => open()}>
        <div>
          <small>TRIGGERS</small>
          <ul class="dt-list">
            {flush.triggers.map((trigger, index) => (
              <li key={index}>
                <span class="dt-mono">{triggerText(trigger)}</span>
                <span class="dt-fill"></span>
                <span class="dt-muted">{`×${trigger.count}`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <small>EFFECTS</small>
          <ul class="dt-list">
            {flush.effects.map((effect, index) => (
              <li key={index}>
                <span class="dt-pill">{effect.kind}</span>
                <button
                  type="button"
                  class="dt-link"
                  disabled={() => effect.path === null}
                  title="Show in Elements"
                  onclick={() => {
                    if (effect.path !== null) devtools.reveal([...effect.path]);
                  }}
                >
                  {effectName(effect)}
                </button>
                <span class="dt-fill"></span>
                <span class="dt-muted">{`×${effect.runs}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export class ReactivityPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  devtools = FromService(DevtoolsModel)!;
  model = FromService(ReactivityModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
  }

  override view() {
    const d = this.devtools;
    const m = this.model;
    const counters = () => d.state.counters;
    const perFlush = () => {
      const r = counters()?.reactivity;
      return r === undefined || r.flushes === 0 ? '0' : (r.flushRuns / r.flushes).toFixed(1);
    };
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>RUNTIME PROFILE</small>
            <h1>Reactivity</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.togglePause()}>
              {() => pauseText(m.state.paused)}
            </button>
            <button type="button" class="dt-button primary" onclick={() => m.clear()}>
              Clear timeline
            </button>
          </div>
        </header>

        <div class="dt-cards">
          <StatCard tone="blue" label="TOTAL RUNS" value={() => integer(counters()?.reactivity.runs)} note={() => `+${m.lastMinuteRuns} in last minute`} />
          <StatCard tone="purple" label="FLUSHES" value={() => integer(counters()?.reactivity.flushes)} note={() => `${perFlush()} effects / flush`} />
          <StatCard tone="green" label="LAST FLUSH" value={() => ms(counters()?.reactivity.lastFlushDuration)} note={() => `Max ${ms(counters()?.reactivity.maxFlushDuration)}`} />
          <StatCard tone="plain" label="LIVE EFFECTS" value={() => integer(counters()?.effects.live)} note={() => `${integer(counters()?.effects.owned)} component-owned`} />
        </div>

        <div class="dt-panel">
          <div class="dt-panel-head">
            <div>
              <b>Flush timeline</b>
              <small>Each completed reactivity cycle, newest first</small>
            </div>
            <span class={() => (m.state.paused ? 'dt-live paused' : 'dt-live')}>{() => liveText(m.state.paused)}</span>
          </div>
          <div class="dt-flush-row dt-table-head">
            <span>TIME</span>
            <span>DURATION</span>
            <span>RUNS</span>
            <span>EFFECTS</span>
            <span>ACTIVITY</span>
          </div>
          <div class="dt-empty small" x-display={() => m.state.flushes.length === 0}>
            No flush recorded yet. Change some state in the app.
          </div>
          {m.state.flushes.map((flush) => (
            <FlushRow key={flush.id} flush={flush} model={m} devtools={d} />
          ))}
        </div>
      </>
    );
  }
}
