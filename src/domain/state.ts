export type Side = 'radiant' | 'dire';

export type Phase =
  'offline' | 'menu' | 'draft' | 'strategy' | 'pregame' | 'live' | 'postgame';

export type PlayerStats = {
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  killStreak: number;
  gold: number;
  gpm: number;
  xpm: number;
  netWorth: number | null;
};

export type HeroStats = {
  id: number;
  key: string;
  level: number;
  alive: boolean;
  respawnSec: number;
  healthPercent: number;
  manaPercent: number;
  buybackCost: number;
  buybackCooldownSec: number;
  smoked: boolean;
  scepter: boolean;
  shard: boolean;
};

export type ItemSlot = {
  slot: number;
  name: string;
  cooldownSec: number;
  charges: number | null;
};

export type Buildings = {
  towers: number;
  racks: number;
  ancientPercent: number | null;
};

export type Roshan = {
  state: string;
  endSec: number;
};

export type MatchState = {
  /** Dota has posted something recently. */
  present: boolean;
  phase: Phase;
  matchId: string;
  /** Negative before the horn, like the in-game clock. */
  clockSec: number;
  paused: boolean;
  daytime: boolean;
  side: Side | null;
  spectating: boolean;
  radiantScore: number;
  direScore: number;
  winner: Side | null;
  steamId: string;
  playerName: string;
  player: PlayerStats | null;
  hero: HeroStats | null;
  items: ItemSlot[];
  radiantBuildings: Buildings | null;
  direBuildings: Buildings | null;
  roshan: Roshan | null;
  updatedAtMs: number;
};

export const OFFLINE: MatchState = {
  present: false,
  phase: 'offline',
  matchId: '',
  clockSec: 0,
  paused: false,
  daytime: true,
  side: null,
  spectating: false,
  radiantScore: 0,
  direScore: 0,
  winner: null,
  steamId: '',
  playerName: '',
  player: null,
  hero: null,
  items: [],
  radiantBuildings: null,
  direBuildings: null,
  roshan: null,
  updatedAtMs: 0,
};

/** True once there is a match worth putting on the Bar. */
export function inMatch(state: MatchState) {
  return (
    state.present &&
    state.phase !== 'offline' &&
    state.phase !== 'menu' &&
    state.matchId !== ''
  );
}

export function isPlaying(state: MatchState) {
  return state.phase === 'live' || state.phase === 'pregame';
}

/** My team's score first, then theirs. Spectators keep radiant on the left. */
export function myScore(state: MatchState) {
  return state.side === 'dire' ? state.direScore : state.radiantScore;
}

export function theirScore(state: MatchState) {
  return state.side === 'dire' ? state.radiantScore : state.direScore;
}

export function enemySide(side: Side | null): Side | null {
  if (side === null) {
    return null;
  }

  return side === 'radiant' ? 'dire' : 'radiant';
}

export function buildingsOf(state: MatchState, side: Side | null) {
  if (side === null) {
    return null;
  }

  return side === 'radiant' ? state.radiantBuildings : state.direBuildings;
}

/** 'win' / 'loss' from my seat, or null while nobody has won. */
export function outcome(state: MatchState): 'win' | 'loss' | null {
  if (!state.winner) {
    return null;
  }

  if (state.side === null) {
    return null;
  }

  return state.winner === state.side ? 'win' : 'loss';
}
