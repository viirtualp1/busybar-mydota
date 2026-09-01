import {
  buildingsOf,
  enemySide,
  isPlaying,
  outcome,
  type MatchState,
  type Phase,
} from './state';

export type MatchEventKind =
  | 'match-start'
  | 'match-end'
  | 'kill'
  | 'death'
  | 'streak'
  | 'level'
  | 'tower'
  | 'racks'
  | 'roshan'
  | 'buyback'
  | 'low-hp';

/** Drives the LED colour: something went my way, against me, or neither. */
export type Tone = 'good' | 'bad' | 'neutral';

export type MatchEvent = {
  kind: MatchEventKind;
  tone: Tone;
  text: string;
  priority: number;
  sound: boolean;
};

export const STREAK_WORDS: Record<number, string> = {
  3: 'Killing spree',
  4: 'Dominating',
  5: 'Mega kill',
  6: 'Unstoppable',
  7: 'Wicked sick',
  8: 'Monster kill',
  9: 'Godlike',
  10: 'Beyond godlike',
};

export const EVENT_TEXT = {
  matchStart: () => 'Game on',
  win: () => 'Victory',
  loss: () => 'Defeat',
  kill: (gained: number) => (gained > 1 ? `${gained} kills` : 'Kill'),
  streak: (streak: number) =>
    STREAK_WORDS[Math.min(10, streak)] ?? `${streak} kill streak`,
  death: () => 'You died',
  level: (level: number) => `Level ${level}`,
  towerLost: () => 'Our tower fell',
  towerTaken: () => 'Their tower fell',
  racksLost: () => 'Our rax fell',
  racksTaken: () => 'Their rax fell',
  roshanDead: () => 'Roshan is down',
  roshanAlive: () => 'Roshan is up',
  buyback: () => 'Buyback ready',
  lowHp: () => 'Low HP',
} as const;

export const LOW_HP_PERCENT = 20;

const PRIORITY = {
  matchEnd: 100,
  death: 80,
  streak: 70,
  kill: 60,
  racks: 55,
  roshan: 50,
  matchStart: 45,
  tower: 40,
  buyback: 30,
  lowHp: 25,
  level: 20,
} as const;

export type EventState = {
  matchId: string;
  phase: Phase;
  kills: number;
  deaths: number;
  level: number;
  killStreak: number;
  alive: boolean;
  lowHp: boolean;
  buybackReady: boolean;
  myTowers: number | null;
  theirTowers: number | null;
  myRacks: number | null;
  theirRacks: number | null;
  roshanState: string;
  ended: boolean;
};

export const initialEventState: EventState = {
  matchId: '',
  phase: 'offline',
  kills: 0,
  deaths: 0,
  level: 0,
  killStreak: 0,
  alive: true,
  lowHp: false,
  buybackReady: false,
  myTowers: null,
  theirTowers: null,
  myRacks: null,
  theirRacks: null,
  roshanState: '',
  ended: false,
};

export function stateOf(match: MatchState): EventState {
  const mine = buildingsOf(match, match.side);
  const theirs = buildingsOf(match, enemySide(match.side));
  const hero = match.hero;

  return {
    matchId: match.matchId,
    phase: match.phase,
    kills: match.player?.kills ?? 0,
    deaths: match.player?.deaths ?? 0,
    level: hero?.level ?? 0,
    killStreak: match.player?.killStreak ?? 0,
    alive: hero?.alive ?? true,
    lowHp: hero !== null && hero.alive && hero.healthPercent <= LOW_HP_PERCENT,
    buybackReady:
      hero !== null && hero.buybackCooldownSec === 0 && match.player !== null
        ? match.player.gold >= hero.buybackCost && hero.buybackCost > 0
        : false,
    myTowers: mine?.towers ?? null,
    theirTowers: theirs?.towers ?? null,
    myRacks: mine?.racks ?? null,
    theirRacks: theirs?.racks ?? null,
    roshanState: match.roshan?.state ?? '',
    ended: match.winner !== null,
  };
}

export type Detection = {
  event: MatchEvent | null;
  state: EventState;
};

export function detectEvent(previous: EventState, match: MatchState): Detection {
  const next = stateOf(match);

  // A new match id means a fresh baseline, never a burst of phantom events.
  if (previous.matchId !== next.matchId) {
    return { event: null, state: next };
  }

  if (!previous.matchId) {
    return { event: null, state: next };
  }

  return { event: pick(previous, next, match), state: next };
}

function pick(
  previous: EventState,
  next: EventState,
  match: MatchState,
): MatchEvent | null {
  if (next.ended && !previous.ended) {
    const result = outcome(match);
    if (result) {
      return {
        kind: 'match-end',
        tone: result === 'win' ? 'good' : 'bad',
        text: result === 'win' ? EVENT_TEXT.win() : EVENT_TEXT.loss(),
        priority: PRIORITY.matchEnd,
        sound: true,
      };
    }
  }

  if (previous.phase !== 'live' && next.phase === 'live') {
    return {
      kind: 'match-start',
      tone: 'neutral',
      text: EVENT_TEXT.matchStart(),
      priority: PRIORITY.matchStart,
      sound: true,
    };
  }

  if (!isPlaying(match)) {
    return null;
  }

  if (next.deaths > previous.deaths) {
    return {
      kind: 'death',
      tone: 'bad',
      text: EVENT_TEXT.death(),
      priority: PRIORITY.death,
      sound: true,
    };
  }

  if (next.kills > previous.kills) {
    const gained = next.kills - previous.kills;
    if (next.killStreak >= 3 && next.killStreak > previous.killStreak) {
      return {
        kind: 'streak',
        tone: 'good',
        text: EVENT_TEXT.streak(next.killStreak),
        priority: PRIORITY.streak,
        sound: true,
      };
    }

    return {
      kind: 'kill',
      tone: 'good',
      text: EVENT_TEXT.kill(gained),
      priority: PRIORITY.kill,
      sound: true,
    };
  }

  const racks = buildingEvent(
    previous.myRacks,
    next.myRacks,
    previous.theirRacks,
    next.theirRacks,
    'racks',
    PRIORITY.racks,
  );
  if (racks) {
    return racks;
  }

  const towers = buildingEvent(
    previous.myTowers,
    next.myTowers,
    previous.theirTowers,
    next.theirTowers,
    'tower',
    PRIORITY.tower,
  );
  if (towers) {
    return towers;
  }

  if (next.roshanState && next.roshanState !== previous.roshanState) {
    const dead = /dead|respawn/i.test(next.roshanState);
    const alive = /alive/i.test(next.roshanState);
    if (dead || alive) {
      return {
        kind: 'roshan',
        tone: 'neutral',
        text: dead ? EVENT_TEXT.roshanDead() : EVENT_TEXT.roshanAlive(),
        priority: PRIORITY.roshan,
        sound: true,
      };
    }
  }

  if (next.level > previous.level && previous.level > 0) {
    return {
      kind: 'level',
      tone: 'good',
      text: EVENT_TEXT.level(next.level),
      priority: PRIORITY.level,
      sound: false,
    };
  }

  if (!next.alive && next.buybackReady && !previous.buybackReady) {
    return {
      kind: 'buyback',
      tone: 'neutral',
      text: EVENT_TEXT.buyback(),
      priority: PRIORITY.buyback,
      sound: false,
    };
  }

  if (next.lowHp && !previous.lowHp) {
    return {
      kind: 'low-hp',
      tone: 'bad',
      text: EVENT_TEXT.lowHp(),
      priority: PRIORITY.lowHp,
      sound: false,
    };
  }

  return null;
}

function buildingEvent(
  minePrevious: number | null,
  mineNext: number | null,
  theirsPrevious: number | null,
  theirsNext: number | null,
  kind: 'tower' | 'racks',
  priority: number,
): MatchEvent | null {
  const lost = minePrevious !== null && mineNext !== null && mineNext < minePrevious;
  const taken =
    theirsPrevious !== null && theirsNext !== null && theirsNext < theirsPrevious;

  if (!lost && !taken) {
    return null;
  }

  const text =
    kind === 'racks'
      ? taken
        ? EVENT_TEXT.racksTaken()
        : EVENT_TEXT.racksLost()
      : taken
        ? EVENT_TEXT.towerTaken()
        : EVENT_TEXT.towerLost();

  return {
    kind,
    tone: taken ? 'good' : 'bad',
    text,
    priority,
    sound: true,
  };
}
