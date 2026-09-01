import type {
  Buildings,
  HeroStats,
  ItemSlot,
  MatchState,
  Phase,
  PlayerStats,
  Roshan,
  Side,
} from '../domain/state';
import { OFFLINE } from '../domain/state';
import type {
  GsiBuilding,
  GsiHero,
  GsiItems,
  GsiMap,
  GsiPayload,
  GsiPlayer,
} from './types';

const PHASE_BY_GAME_STATE: Record<string, Phase> = {
  DOTA_GAMERULES_STATE_DISCONNECT: 'menu',
  DOTA_GAMERULES_STATE_GAME_IN_PROGRESS: 'live',
  DOTA_GAMERULES_STATE_HERO_SELECTION: 'draft',
  DOTA_GAMERULES_STATE_INIT: 'pregame',
  DOTA_GAMERULES_STATE_LAST: 'menu',
  DOTA_GAMERULES_STATE_POST_GAME: 'postgame',
  DOTA_GAMERULES_STATE_PRE_GAME: 'pregame',
  DOTA_GAMERULES_STATE_STRATEGY_TIME: 'strategy',
  DOTA_GAMERULES_STATE_TEAM_SHOWCASE: 'strategy',
  DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD: 'pregame',
  DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD: 'pregame',
};

const INVENTORY_SLOTS = 6;
const TOWERS_PER_SIDE = 11;
const RACKS_PER_SIDE = 6;

export function parsePayload(payload: GsiPayload, nowMs: number): MatchState {
  const map = payload.map;
  if (!map || typeof map.game_state !== 'string') {
    return { ...OFFLINE, present: true, phase: 'menu', updatedAtMs: nowMs };
  }

  const phase = PHASE_BY_GAME_STATE[map.game_state] ?? 'menu';
  const player = flatten<GsiPlayer>(payload.player);
  const hero = flatten<GsiHero>(payload.hero);
  const items = flattenItems(payload.items);
  const spectating = payload.player !== undefined && player === null;
  const side = sideOf(player?.team_name);

  return {
    present: true,
    phase,
    matchId: typeof map.matchid === 'string' ? map.matchid : '',
    clockSec: clockOf(map),
    paused: map.paused === true,
    daytime: map.daytime !== false,
    side,
    spectating,
    radiantScore: count(map.radiant_score),
    direScore: count(map.dire_score),
    winner: winnerOf(map.win_team),
    steamId: typeof player?.steamid === 'string' ? player.steamid : '',
    playerName: typeof player?.name === 'string' ? player.name : '',
    player: player ? playerStats(player) : null,
    hero: hero ? heroStats(hero) : null,
    items: items ? itemSlots(items) : [],
    radiantBuildings: buildingsOf(payload.buildings?.radiant),
    direBuildings: buildingsOf(payload.buildings?.dire),
    roshan: roshanOf(map),
    updatedAtMs: nowMs,
  };
}

/**
 * Playing gives `{ kills: 3 }`; spectating gives `{ team2: { player0: {...} } }`.
 * Only the flat form describes a seat we can put on the Bar.
 */
function flatten<T extends object>(block: unknown): T | null {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  const values = Object.values(block as Record<string, unknown>);
  const nested = values.some(
    (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  const flat = values.some((value) => typeof value !== 'object' || value === null);

  return nested && !flat ? null : (block as T);
}

/**
 * Items are objects all the way down, so the shape has to be read off the keys:
 * my own inventory is keyed by slot, a spectated one by team and player.
 */
function flattenItems(block: unknown): GsiItems | null {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  const slotted = Object.keys(block).some((key) =>
    /^(slot|stash|neutral|teleport)\d*$/.test(key),
  );

  return slotted ? (block as GsiItems) : null;
}

function clockOf(map: GsiMap) {
  if (typeof map.clock_time === 'number' && Number.isFinite(map.clock_time)) {
    return Math.trunc(map.clock_time);
  }

  return typeof map.game_time === 'number' && Number.isFinite(map.game_time)
    ? Math.trunc(map.game_time)
    : 0;
}

function sideOf(team: unknown): Side | null {
  if (team === 'radiant' || team === 'dire') {
    return team;
  }

  return null;
}

function winnerOf(team: unknown): Side | null {
  return sideOf(typeof team === 'string' ? team.toLowerCase() : team);
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, count(value)));
}

function playerStats(player: GsiPlayer): PlayerStats {
  return {
    kills: count(player.kills),
    deaths: count(player.deaths),
    assists: count(player.assists),
    lastHits: count(player.last_hits),
    denies: count(player.denies),
    killStreak: count(player.kill_streak),
    gold: count(player.gold),
    gpm: count(player.gpm),
    xpm: count(player.xpm),
    netWorth: typeof player.net_worth === 'number' ? count(player.net_worth) : null,
  };
}

function heroStats(hero: GsiHero): HeroStats {
  const alive = hero.alive !== false;

  return {
    id: count(hero.id),
    key: typeof hero.name === 'string' ? hero.name : '',
    level: count(hero.level),
    alive,
    respawnSec: alive ? 0 : Math.max(0, count(hero.respawn_seconds)),
    healthPercent: clampPercent(hero.health_percent),
    manaPercent: clampPercent(hero.mana_percent),
    buybackCost: count(hero.buyback_cost),
    buybackCooldownSec: Math.max(0, count(hero.buyback_cooldown)),
    smoked: hero.smoked === true,
    scepter: hero.aghanims_scepter === true,
    shard: hero.aghanims_shard === true,
  };
}

function itemSlots(items: GsiItems): ItemSlot[] {
  const slots: ItemSlot[] = [];
  for (let index = 0; index < INVENTORY_SLOTS; index += 1) {
    const item = items[`slot${index}`];
    const name = typeof item?.name === 'string' ? item.name : '';
    if (!name || name === 'empty') {
      continue;
    }
    slots.push({
      slot: index,
      name,
      cooldownSec: Math.max(0, count(item?.cooldown)),
      charges: typeof item?.charges === 'number' ? count(item.charges) : null,
    });
  }

  return slots;
}

/**
 * A destroyed building either drops out of the block or reports zero health,
 * depending on the client build, so both are counted as gone.
 */
function buildingsOf(
  block: Record<string, GsiBuilding | undefined> | undefined,
): Buildings | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  let towers = 0;
  let racks = 0;
  let ancientPercent: number | null = null;

  for (const [key, value] of Object.entries(block)) {
    const health = count(value?.health);
    const maxHealth = count(value?.max_health);
    if (key.includes('fort')) {
      ancientPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : null;
      continue;
    }
    if (health <= 0) {
      continue;
    }
    if (key.includes('tower')) {
      towers += 1;
    } else if (key.includes('rax')) {
      racks += 1;
    }
  }

  return {
    towers: Math.min(TOWERS_PER_SIDE, towers),
    racks: Math.min(RACKS_PER_SIDE, racks),
    ancientPercent,
  };
}

function roshanOf(map: GsiMap): Roshan | null {
  if (typeof map.roshan_state !== 'string' || !map.roshan_state) {
    return null;
  }

  return {
    state: map.roshan_state,
    endSec: Math.max(0, count(map.roshan_state_end_seconds)),
  };
}
