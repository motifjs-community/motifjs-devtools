import { Component, FromService } from '@motifx/core';
import { VERSION } from '../../version';
import { ICONS } from '../icons';
import { DevtoolsModel, type Section } from '../model/DevtoolsModel';
import { HomeModel, LINKS, REPO, type HomeLink } from '../model/HomeModel';

const LOGO = ICONS.logo.replace('width="22" height="22"', 'width="64" height="64"');

const count = (value: number | null | undefined) => (value === null || value === undefined ? '–' : String(value));

function Stat(props: { label: string; value: () => string; note: () => string; section: Section; devtools: DevtoolsModel }) {
  return (
    <button type="button" class="dt-card dt-home-stat" onclick={() => props.devtools.select(props.section)}>
      <small>{props.label}</small>
      <b>{() => props.value()}</b>
      <span>{() => props.note()}</span>
    </button>
  );
}

function LinkCard(props: { link: HomeLink }) {
  const { link } = props;
  return (
    <a class={`dt-home-link ${link.id}`} href={link.href} target="_blank" rel="noopener noreferrer">
      <span class="dt-home-link-icon" x-html={ICONS[link.icon as keyof typeof ICONS]}></span>
      <span class="dt-home-link-text">
        <b>{link.title}</b>
        <small>{link.note}</small>
      </span>
    </a>
  );
}

export class HomePage extends Component<HTMLElement> {
  static override elementTag = 'section';
  devtools = FromService(DevtoolsModel)!;
  model = FromService(HomeModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-home');
  }

  override view() {
    const d = this.devtools;
    const m = this.model;
    const status = () => d.state.status;
    const coreText = () => status().coreVersion ?? '–';
    const hostText = () => {
      if (!status().connected) return 'Waiting for the app: call app.useDevelopment(true)';
      return status().host ? `Connected to ${status().host}` : 'Connected';
    };
    const issuesNote = () => (d.state.issues === 0 ? 'nothing reported' : 'warnings and errors');
    return (
      <>
        <div class="dt-panel dt-hero">
          <span class="dt-hero-logo" x-html={LOGO}></span>
          <div class="dt-hero-main">
            <small>MOTIF DEVTOOLS</small>
            <h1>Look inside your MotifJS app</h1>
            <p class="dt-muted">Components, reactivity, routes, stores and services of the page, live.</p>
            <div class="dt-hero-versions">
              <span class="dt-version-chip">
                <small>DevTools</small>
                <b>{`v${VERSION}`}</b>
              </span>
              <span class="dt-version-chip core">
                <small>MotifJS</small>
                <b>{() => coreText()}</b>
              </span>
              <span class="dt-version-chip">
                <small>Contract</small>
                <b>{() => `v${status().version ?? '–'}`}</b>
              </span>
            </div>
            <span class="dt-hero-status">
              <i class={() => (status().connected ? 'dt-dot ok' : 'dt-dot')}></i>
              {() => hostText()}
            </span>
          </div>
          <a class="dt-button primary dt-star" href={REPO} target="_blank" rel="noopener noreferrer">
            <span class="dt-button-icon" x-html={ICONS.star}></span>
            Star on GitHub
          </a>
        </div>

        <div class="dt-cards dt-home-stats">
          <Stat label="COMPONENTS" value={() => count(d.state.counters?.components.inTree)} note={() => 'in the tree'} section="elements" devtools={d} />
          <Stat label="STORES" value={() => count(m.state.stores)} note={() => 'in use'} section="stores" devtools={d} />
          <Stat label="SERVICES" value={() => count(m.state.services)} note={() => 'registered'} section="services" devtools={d} />
          <Stat label="ROUTES" value={() => count(m.state.routes)} note={() => (m.state.routes === null ? 'no router' : 'configured')} section="router" devtools={d} />
          <Stat label="ISSUES" value={() => String(d.state.issues)} note={() => issuesNote()} section="logs" devtools={d} />
        </div>

        <div class="dt-panel">
          <div class="dt-panel-head">
            <div>
              <b>Community</b>
              <small>Code, documentation, and where to report a bug or share an idea</small>
            </div>
          </div>
          <div class="dt-home-links">
            {LINKS.map((link) => (
              <LinkCard key={link.id} link={link} />
            ))}
          </div>
        </div>
      </>
    );
  }
}
