import { AccountSource, toAccountId, type AccountStats } from './account/opendota';
import type { BarDisplay } from './bar/display';
import { errorMessage, isForbidden } from 'busybar-kit/errors';
import { BACK } from './bar/layout';
import type { Config } from './config';
import {
  detectEvent,
  initialEventState,
  type EventState,
  type MatchEvent,
} from './domain/events';
import { inMatch, type MatchState } from './domain/state';
import { EventTicker } from 'busybar-kit/ticker';
import type { HeroCatalog } from './dota/heroes';
import type { GsiServer } from './gsi/server';
import { buildFrame } from './view/frame';

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type AppDeps = {
  config: Config;
  gsi: GsiServer;
  heroes: HeroCatalog;
  display: BarDisplay;
  makeAccount?: (accountId: number) => AccountSource;
  logger?: Logger;
};

const BAR_RETRY_MS = 2000;
const REPEAT_WARNING_MS = 30_000;

/**
 * How long a finished game stays on the Bar when Dota goes quiet on us — closed
 * mid-scoreboard, or alt-tabbed away. A deliberate return to the menu clears it
 * instead, so leaving a game shows the waiting screen rather than a stale score.
 */
export const RESULT_HOLD_MS = 90_000;

/** OpenDota needs a moment to ingest a match before it shows up. */
const POST_MATCH_REFRESH_MS = 120_000;

export class App {
  private readonly config: Config;
  private readonly gsi: GsiServer;
  private readonly heroes: HeroCatalog;
  private readonly display: BarDisplay;
  private readonly logger: Logger;
  private readonly makeAccount: (accountId: number) => AccountSource;
  private readonly ticker = new EventTicker<MatchEvent>();

  private events: EventState = initialEventState;
  private account: AccountSource | null = null;
  private accountStats: AccountStats | null = null;
  private accountFetchedAt = 0;
  private accountDueAt = 0;
  private finished: MatchState | null = null;
  private finishedAt = 0;
  private note = '';
  private running = false;
  private loops: Promise<void>[] = [];
  private warnings = new Map<string, { message: string; at: number }>();
  private blanked = false;

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.gsi = deps.gsi;
    this.heroes = deps.heroes;
    this.display = deps.display;
    this.logger = deps.logger ?? console;
    this.makeAccount =
      deps.makeAccount ??
      ((accountId) =>
        new AccountSource({ accountId, timeoutMs: this.config.requestTimeoutMs }));
    this.note = `GSI ${this.gsi.endpoint}`;
    if (this.config.steamId) {
      this.useSteamId(this.config.steamId);
    }
    // Subscribed here rather than in start(): tracking what Dota reports does
    // not depend on the Bar being reachable, and it keeps the wiring testable.
    this.gsi.onState = (state) => this.handleState(state);
  }

  async start() {
    this.running = true;
    await this.connectBar();
    if (!this.running) {
      return;
    }

    if (!(await this.heroes.load())) {
      this.logger.warn('Hero names unavailable, showing hero ids');
    }
    this.loops = [this.renderLoop(), this.accountLoop()];
  }

  async wait() {
    await Promise.all(this.loops);
  }

  async stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    await Promise.allSettled(this.loops);
    try {
      await this.display.clear();
    } catch {
      /* bar already gone */
    }
  }

  /** What the Bar should show right now: the live game, or a game that just ended. */
  view(nowEpochMs = Date.now()): MatchState {
    const live = this.gsi.state(nowEpochMs);
    if (inMatch(live)) {
      return live;
    }

    if (this.finished && nowEpochMs - this.finishedAt < RESULT_HOLD_MS) {
      return this.finished;
    }

    return live;
  }

  private handleState(state: MatchState) {
    // The demo's steam id is invented, so it must not be looked up upstream.
    if (state.steamId && !this.account && !this.config.demo) {
      this.useSteamId(state.steamId);
    }

    if (state.winner !== null && inMatch(state)) {
      if (this.finished?.matchId !== state.matchId) {
        this.accountDueAt = state.updatedAtMs + POST_MATCH_REFRESH_MS;
      }
      this.finished = state;
      // When Dota reported it, not when we got round to it: the same thing in
      // production, and the only reading that survives an injected clock.
      this.finishedAt = state.updatedAtMs;
    } else if (inMatch(state) && this.finished?.matchId !== state.matchId) {
      this.finished = null;
    } else if (!inMatch(state)) {
      // Back in the menu, so the game was left behind rather than cut off:
      // hold nothing, and let the waiting screen take over straight away.
      this.finished = null;
    }

    const { event, state: next } = detectEvent(this.events, state);
    this.events = next;
    if (!event) {
      return;
    }

    if (!this.ticker.push(event, this.now())) {
      return;
    }

    // Some events carry no wording for the Bar; the kind alone is the log line.
    this.logger.info(event.text ? `[${event.kind}] ${event.text}` : `[${event.kind}]`);
    if (this.config.sounds) {
      void this.display.playEvent(event).catch(() => {
        /* sound is optional */
      });
    }
  }

  private useSteamId(steamId: string) {
    const accountId = toAccountId(steamId);
    if (accountId === null) {
      this.warnRepeated('account', `Cannot read an account id out of ${steamId}`);
      return;
    }
    this.account = this.makeAccount(accountId);
    this.accountDueAt = 0;
    this.logger.info(`Account stats: OpenDota player ${accountId}`);
  }

  private async connectBar() {
    while (this.running) {
      try {
        await this.display.ping();
        this.logger.info(`BUSY Bar connected (${this.config.busyAddr})`);
        this.display.markStale();
        return;
      } catch (error) {
        const hint =
          isForbidden(error) && !this.config.isCloud
            ? ' — set BUSY_HTTP_PASSWORD to the HTTP Access password, leave BUSY_TOKEN empty'
            : '';
        this.warnRepeated(
          'bar',
          `Waiting for BUSY Bar at ${this.config.busyAddr}: ${errorMessage(error)}${hint}`,
        );
        await this.sleep(BAR_RETRY_MS);
      }
    }
  }

  private async accountLoop() {
    while (this.running) {
      await this.refreshAccount();
      await this.sleep(5000);
    }
  }

  private async refreshAccount() {
    if (!this.account) {
      return;
    }
    const now = Date.now();
    if (now < this.accountDueAt) {
      return;
    }
    if (
      this.accountFetchedAt &&
      now - this.accountFetchedAt < this.config.accountPollMs
    ) {
      return;
    }
    // A live game already owns the display; leave the upstream alone until it ends.
    if (inMatch(this.gsi.state(now))) {
      return;
    }

    try {
      this.accountStats = await this.account.poll(now);
      this.accountFetchedAt = now;
      this.warnings.delete('account');
    } catch (error) {
      this.accountFetchedAt = now;
      this.warnRepeated('account', `OpenDota: ${errorMessage(error)}`);
    }
  }

  private async renderLoop() {
    while (this.running) {
      const now = this.now();
      try {
        const match = this.view();
        if (inMatch(match)) {
          this.blanked = false;
          await this.display.push(
            buildFrame(match, {
              heroes: this.heroes,
              maxRows: BACK.maxRows,
              ticker: this.ticker.active(now),
              nowEpochMs: Date.now(),
              account: this.accountStats,
              note: this.note,
              tickerStyle: this.config.tickerStyle,
              tickerChars: this.config.tickerChars,
            }),
          );
        } else {
          await this.blank();
        }
      } catch (error) {
        this.warnRepeated('draw', `BUSY Bar draw failed: ${errorMessage(error)}`);
      }

      await this.sleep(this.config.frameMs);
    }
  }

  private async blank() {
    if (this.blanked) {
      return;
    }
    await this.display.blank();
    this.blanked = true;
    this.logger.info('Idle — display released');
  }

  private warnRepeated(key: string, message: string) {
    const now = this.now();
    const previous = this.warnings.get(key);
    if (
      previous &&
      previous.message === message &&
      now - previous.at < REPEAT_WARNING_MS
    ) {
      return;
    }
    this.warnings.set(key, { message, at: now });
    this.logger.warn(message);
  }

  private now() {
    return performance.now();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
