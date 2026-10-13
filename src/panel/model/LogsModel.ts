import { reactive } from '@motifx/core';
import type { Client } from '../../client/client';

export type Level = 'warning' | 'error';
export type LevelFilter = Level | 'all';

export type SerializedError = { name?: string; message?: string; stack?: string; cause?: unknown } | string | null;

export type LogEntry = {
  key: string;
  level: Level;
  title: string;
  message: string;
  count: number;
  firstAt: number;
  lastAt: number;
  details?: unknown;
  error?: SerializedError;
};

type RawWarning = { code: string; message: string; details?: unknown; count: number; firstAt: number; lastAt: number };
type RawError = { context: string; name: string; message: string; error: SerializedError; count: number; firstAt: number; lastAt: number };

export class LogsModel {
  readonly state = reactive({
    entries: [] as LogEntry[],
    filter: 'all' as LevelFilter,
    expanded: null as string | null,
  });

  private loading = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: Client,
    private readonly delay = 200,
  ) {
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.load();
      }),
      client.onEvent((event) => {
        if (event.type === 'warning' || event.type === 'error:caught') this.schedule();
      }),
    );
  }

  get warnings() {
    return this.state.entries.filter((entry) => entry.level === 'warning').length;
  }

  get errors() {
    return this.state.entries.filter((entry) => entry.level === 'error').length;
  }

  get visible() {
    const filter = this.state.filter;
    return filter === 'all' ? this.state.entries : this.state.entries.filter((entry) => entry.level === filter);
  }

  async load() {
    const ticket = ++this.loading;
    try {
      const [warnings, errors] = await Promise.all([this.client.request<RawWarning[]>('getWarnings'), this.client.request<RawError[]>('getErrors')]);
      if (ticket !== this.loading) return;
      const entries: LogEntry[] = [
        ...(Array.isArray(warnings) ? warnings : []).map((w) => ({
          key: `warning|${w.code}|${w.message}`,
          level: 'warning' as const,
          title: w.code,
          message: w.message,
          count: w.count,
          firstAt: w.firstAt,
          lastAt: w.lastAt,
          details: w.details,
        })),
        ...(Array.isArray(errors) ? errors : []).map((e) => ({
          key: `error|${e.context}|${e.name}|${e.message}`,
          level: 'error' as const,
          title: e.context,
          message: e.message,
          count: e.count,
          firstAt: e.firstAt,
          lastAt: e.lastAt,
          error: e.error,
        })),
      ];
      entries.sort((a, b) => b.lastAt - a.lastAt);
      this.state.entries = entries;
    } catch {}
  }

  setFilter(filter: LevelFilter) {
    this.state.filter = filter;
  }

  toggle(key: string) {
    this.state.expanded = this.state.expanded === key ? null : key;
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    for (const off of this.offs) off();
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, this.delay);
  }
}
