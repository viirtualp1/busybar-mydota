import { FONT_WIDTH, FRONT, myFillWidth } from '../bar/layout';
import type { AccountStats } from '../account/opendota';
import type { MatchEvent, Tone } from '../domain/events';
import {
  buildingsOf,
  enemySide,
  myScore,
  outcome,
  theirScore,
  type MatchState,
} from '../domain/state';
import type { HeroCatalog } from '../dota/heroes';
import { COLORS, sideColors } from './colors';
import {
  formatClock,
  formatGold,
  formatKda,
  formatPercent,
  formatRecord,
  formatTimer,
} from 'busybar-kit/format';
import { fittingChars } from 'busybar-kit/device';
import {
  tickerLine as renderTickerLine,
  tickerLineLooping,
  type TickerStyle,
} from 'busybar-kit/ticker';

export type CellTone = 'normal' | 'good' | 'bad' | 'gold';

export type BackCell = { label: string; value: string; tone: CellTone };

export type BackRow = { left: BackCell | null; right: BackCell | null };

export type FrameMode =
  'offline' | 'idle' | 'draft' | 'pregame' | 'live' | 'dead' | 'postgame' | 'spectate';

export type MyFrame = {
  mode: FrameMode;
  bigText: string;
  bigColor: string;
  /** Font for `bigText`. A whole sentence only fits in the tiny one. */
  bigFont: 'tiny' | 'bold';
  /** The front shows `bigText` alone, centred both ways, and nothing else. */
  bigOnly: boolean;
  clockText: string;
  scoreText: string;
  worthText: string;
  myFill: number;
  myFillColor: string;
  theirFillColor: string;
  showBands: boolean;
  showDivider: boolean;
  ledColor: string;
  tickerText: string;
  backHeader: string;
  backSub: string;
  backRows: BackRow[];
};

export type FrameOptions = {
  heroes: HeroCatalog;
  maxRows: number;
  ticker: { event: MatchEvent; elapsedMs: number } | null;
  nowEpochMs: number;
  account: AccountStats | null;
  note: string;
  tickerStyle: TickerStyle;
  tickerChars: number;
};

export const FRONT_LINE_CHARS = fittingChars(FRONT.width - 2, FONT_WIDTH.tiny);

const LED_BY_TONE: Record<Tone, string> = {
  good: COLORS.ledGood,
  bad: COLORS.ledBad,
  neutral: COLORS.ledNeutral,
};

function ledFor(event: MatchEvent | null) {
  return event ? LED_BY_TONE[event.tone] : '';
}

function eventLine(options: FrameOptions) {
  if (!options.ticker) {
    return '';
  }

  return renderTickerLine(
    options.tickerStyle,
    options.ticker.event.text,
    options.tickerChars,
    options.ticker.elapsedMs,
  );
}

function cell(label: string, value: string, tone: CellTone = 'normal'): BackCell | null {
  return value ? { label, value, tone } : null;
}

/** Drops the cells that had nothing to say, then pairs what is left into rows. */
function rows(cells: (BackCell | null)[], maxRows: number): BackRow[] {
  const filled = cells.filter((entry): entry is BackCell => entry !== null);
  const out: BackRow[] = [];
  for (let index = 0; index < filled.length; index += 2) {
    out.push({ left: filled[index] ?? null, right: filled[index + 1] ?? null });
  }

  return out.slice(0, maxRows);
}

function base(options: FrameOptions): MyFrame {
  return {
    mode: 'idle',
    bigText: '',
    bigColor: COLORS.white,
    bigFont: 'bold',
    bigOnly: false,
    clockText: '',
    scoreText: '',
    worthText: '',
    myFill: Math.round(FRONT.width / 2),
    myFillColor: COLORS.radiantFill,
    theirFillColor: COLORS.direFill,
    showBands: false,
    showDivider: false,
    ledColor: ledFor(options.ticker?.event ?? null),
    tickerText: eventLine(options),
    backHeader: '',
    backSub: '',
    backRows: [],
  };
}

export function buildFrame(match: MatchState, options: FrameOptions): MyFrame {
  if (!match.present || match.phase === 'offline') {
    return offlineFrame(options);
  }

  if (match.phase === 'menu' || !match.matchId) {
    return idleFrame(options);
  }

  if (match.spectating) {
    return spectateFrame(match, options);
  }

  if (match.phase === 'postgame' || match.winner !== null) {
    return resultFrame(match, options);
  }

  if (match.phase === 'draft' || match.phase === 'strategy') {
    return draftFrame(match, options);
  }

  return liveFrame(match, options);
}

function offlineFrame(options: FrameOptions): MyFrame {
  const frame = base(options);
  frame.mode = 'offline';
  frame.bigText = 'DOTA';
  frame.bigColor = COLORS.dim;
  frame.clockText = 'OFFLINE';
  frame.backHeader = 'Waiting for Dota 2';
  frame.backSub = options.note;
  frame.backRows = rows(
    [
      cell('GSI', 'no packets'),
      cell('SETUP', 'gsi:install'),
      cell('THEN', 'restart Dota'),
    ],
    options.maxRows,
  );
  if (!frame.tickerText) {
    frame.tickerText = 'waiting for Dota 2';
  }

  return frame;
}

export const WAITING_TEXT = 'waiting for the game';

/**
 * Out of a match and back in the menu. Text only, on purpose: the old screen
 * put today's record up in the big font, where a "4-2" read as a live team
 * score and a menu that never changes read as a frozen one.
 */
function idleFrame(options: FrameOptions): MyFrame {
  const frame = base(options);
  const account = options.account;
  frame.mode = 'idle';
  frame.bigText = tickerLineLooping(
    options.tickerStyle,
    WAITING_TEXT,
    options.tickerChars,
    options.nowEpochMs,
  );
  frame.bigFont = 'tiny';
  frame.bigColor = COLORS.muted;
  frame.bigOnly = true;

  if (!account) {
    frame.backHeader = 'Waiting for the game';
    frame.backSub = options.note;

    return frame;
  }

  const last = account.last;
  frame.backHeader = 'Waiting for the game';
  frame.backSub = [account.personaName, account.rank || 'unranked']
    .filter(Boolean)
    .join('  ');
  frame.backRows = rows(
    [
      cell('TODAY', formatRecord(account.today.wins, account.today.losses)),
      cell(
        'STREAK',
        account.streak ? `${account.streak.kind}${account.streak.length}` : '',
        account.streak?.kind === 'W' ? 'good' : 'bad',
      ),
      cell('LAST', last ? (last.win ? 'WIN' : 'LOSS') : '', last?.win ? 'good' : 'bad'),
      cell('HERO', last ? options.heroes.name(last.heroId) : ''),
      cell('KDA', last ? formatKda(last.kills, last.deaths, last.assists) : ''),
      cell('TIME', last ? formatClock(last.durationSec) : ''),
    ],
    options.maxRows,
  );

  return frame;
}

function draftFrame(match: MatchState, options: FrameOptions): MyFrame {
  const frame = base(options);
  const mine = sideColors(match.side);
  const theirs = sideColors(enemySide(match.side));
  const strategy = match.phase === 'strategy';
  frame.mode = 'draft';
  frame.bigText = 'DRAFT';
  frame.showBands = true;
  frame.showDivider = true;
  frame.myFillColor = mine.fill;
  frame.theirFillColor = theirs.fill;
  frame.clockText = strategy ? 'STRAT' : 'PICK';
  frame.scoreText = sideWord(match).slice(0, 3);
  frame.backHeader = heroTitle(match, options) || 'Hero selection';
  frame.backSub = strategy ? 'Strategy time' : 'Hero selection';
  frame.backRows = rows(
    [
      cell('HERO', heroName(match, options) || 'picking'),
      cell('SIDE', sideWord(match)),
      cell('MATCH', match.matchId ? `#${match.matchId.slice(-6)}` : ''),
    ],
    options.maxRows,
  );

  return frame;
}

function liveFrame(match: MatchState, options: FrameOptions): MyFrame {
  const frame = base(options);
  const mine = sideColors(match.side);
  const theirs = sideColors(enemySide(match.side));
  const player = match.player;
  const hero = match.hero;
  const dead = hero !== null && !hero.alive;

  frame.mode = dead ? 'dead' : match.phase === 'pregame' ? 'pregame' : 'live';
  frame.showBands = true;
  frame.showDivider = true;
  frame.myFillColor = mine.fill;
  frame.theirFillColor = theirs.fill;
  frame.myFill = myFillWidth(myScore(match), theirScore(match));

  // Dead is its own screen: the respawn countdown alone, centred on the strip.
  // The word for it is already obvious from the colour and the back panel.
  frame.bigText = dead
    ? formatTimer(Math.max(1, hero.respawnSec))
    : formatKda(player?.kills ?? 0, player?.deaths ?? 0, player?.assists ?? 0);
  frame.bigColor = dead ? COLORS.danger : COLORS.white;
  frame.bigOnly = dead;
  frame.clockText = match.paused ? 'PAUSE' : formatClock(match.clockSec);
  frame.scoreText = `${myScore(match)}-${theirScore(match)}`;
  frame.worthText = player ? formatGold(player.netWorth ?? player.gold) : '';

  frame.backHeader = heroTitle(match, options);
  frame.backSub = [
    match.paused ? 'PAUSED' : formatClock(match.clockSec),
    `${myScore(match)}-${theirScore(match)}`,
    match.daytime ? 'DAY' : 'NIGHT',
  ].join('  ');
  frame.backRows = liveRows(match, options, dead);

  return frame;
}

function liveRows(match: MatchState, options: FrameOptions, dead: boolean): BackRow[] {
  const player = match.player;
  const hero = match.hero;
  const mineBuildings = buildingsOf(match, match.side);
  const theirBuildings = buildingsOf(match, enemySide(match.side));
  const canBuyback =
    hero !== null &&
    player !== null &&
    hero.buybackCooldownSec === 0 &&
    hero.buybackCost > 0 &&
    player.gold >= hero.buybackCost;

  const survival: (BackCell | null)[] = dead
    ? [
        cell('DEAD', formatTimer(hero?.respawnSec ?? 0), 'bad'),
        cell('BUY', buybackValue(match), canBuyback ? 'good' : 'normal'),
      ]
    : [
        cell(
          'HP',
          hero ? formatPercent(hero.healthPercent) : '',
          hero && hero.healthPercent <= 25 ? 'bad' : 'normal',
        ),
        cell('MP', hero ? formatPercent(hero.manaPercent) : ''),
      ];

  return rows(
    [
      cell('KDA', kdaOf(match)),
      cell('CS', player ? `${player.lastHits}/${player.denies}` : ''),
      cell('GPM', player ? String(player.gpm) : ''),
      cell('XPM', player ? String(player.xpm) : ''),
      cell('NET', worthOf(match), 'gold'),
      cell('GOLD', player ? formatGold(player.gold) : '', 'gold'),
      ...survival,
      cell(
        'TWR',
        mineBuildings && theirBuildings
          ? `${mineBuildings.towers}-${theirBuildings.towers}`
          : '',
      ),
      cell(
        'RAX',
        mineBuildings && theirBuildings
          ? `${mineBuildings.racks}-${theirBuildings.racks}`
          : '',
      ),
    ],
    options.maxRows,
  );
}

function buybackValue(match: MatchState) {
  const hero = match.hero;
  if (!hero || hero.buybackCost <= 0) {
    return '';
  }

  return hero.buybackCooldownSec > 0
    ? formatTimer(hero.buybackCooldownSec)
    : formatGold(hero.buybackCost);
}

function resultFrame(match: MatchState, options: FrameOptions): MyFrame {
  const frame = base(options);
  const result = outcome(match);
  const won = result === 'win';
  frame.mode = 'postgame';
  frame.bigText = result === null ? 'OVER' : won ? 'VICTORY' : 'DEFEAT';
  frame.bigColor = result === null ? COLORS.white : won ? COLORS.radiant : COLORS.dire;
  frame.showBands = true;
  frame.myFill = won ? FRONT.width - 6 : 6;
  frame.myFillColor = won ? COLORS.radiantFill : COLORS.direFill;
  frame.theirFillColor = won ? COLORS.radiantFill : COLORS.direFill;
  frame.clockText = formatClock(match.clockSec);
  frame.scoreText = `${myScore(match)}-${theirScore(match)}`;
  frame.worthText = worthOf(match);
  frame.backHeader = result === null ? 'Game over' : won ? 'Victory' : 'Defeat';
  frame.backSub = `${heroName(match, options)}  ${formatClock(match.clockSec)}`.trim();
  frame.backRows = rows(
    [
      cell('KDA', kdaOf(match)),
      cell('CS', match.player ? `${match.player.lastHits}/${match.player.denies}` : ''),
      cell('GPM', match.player ? String(match.player.gpm) : ''),
      cell('XPM', match.player ? String(match.player.xpm) : ''),
      cell('NET', worthOf(match), 'gold'),
      cell('SCORE', `${myScore(match)}-${theirScore(match)}`),
    ],
    options.maxRows,
  );

  return frame;
}

function spectateFrame(match: MatchState, options: FrameOptions): MyFrame {
  const frame = base(options);
  frame.mode = 'spectate';
  frame.showBands = true;
  frame.showDivider = true;
  frame.myFill = myFillWidth(match.radiantScore, match.direScore);
  frame.bigText = `${match.radiantScore}-${match.direScore}`;
  frame.clockText = match.paused ? 'PAUSE' : formatClock(match.clockSec);
  frame.scoreText = 'WATCH';
  frame.backHeader = 'Spectating';
  frame.backSub = `${formatClock(match.clockSec)}  ${match.radiantScore}-${match.direScore}`;
  frame.backRows = rows(
    [
      cell('RAD', String(match.radiantScore), 'good'),
      cell('DIRE', String(match.direScore), 'bad'),
      cell('TIME', formatClock(match.clockSec)),
      cell('LIGHT', match.daytime ? 'DAY' : 'NIGHT'),
    ],
    options.maxRows,
  );

  return frame;
}

function kdaOf(match: MatchState) {
  const player = match.player;

  return formatKda(
    player?.kills ?? null,
    player?.deaths ?? null,
    player?.assists ?? null,
  );
}

function worthOf(match: MatchState) {
  const player = match.player;

  return player ? formatGold(player.netWorth ?? player.gold) : '';
}

function heroName(match: MatchState, options: FrameOptions) {
  if (match.hero && match.hero.id > 0) {
    return options.heroes.name(match.hero.id);
  }

  return match.hero?.key ? prettyHeroKey(match.hero.key) : '';
}

function heroTitle(match: MatchState, options: FrameOptions) {
  const name = heroName(match, options);
  const level = match.hero?.level ?? 0;
  if (!name) {
    return match.playerName;
  }

  return level > 0 ? `${name}  L${level}` : name;
}

export function prettyHeroKey(key: string) {
  return key
    .replace(/^npc_dota_hero_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sideWord(match: MatchState) {
  if (!match.side) {
    return '';
  }

  return match.side === 'radiant' ? 'RADIANT' : 'DIRE';
}
