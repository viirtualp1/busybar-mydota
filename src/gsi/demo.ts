import type { GsiBuilding, GsiPayload } from './types';

/** Real seconds per game second, so a 30 minute game runs in about 90. */
export const DEMO_SPEED = 20;

export const DEMO_GAME_SECONDS = 30 * 60;

const DRAFT_SECONDS = 90;

const HERO_ID = 8;
const HERO_KEY = 'npc_dota_hero_juggernaut';

const DEATHS_AT = [8 * 60, 17 * 60, 24 * 60] as const;
const DEAD_FOR = 35;

const TOWER_LANES = ['top', 'mid', 'bot'] as const;

const MY_TOWER_FALLS = [12 * 60, 18 * 60, 24 * 60] as const;
const THEIR_TOWER_FALLS = [9 * 60, 13 * 60, 16 * 60, 20 * 60, 22 * 60, 25 * 60] as const;
const THEIR_RAX_FALLS = [27 * 60, 28 * 60] as const;

export function demoClock(elapsedMs: number) {
  return Math.round((elapsedMs / 1000) * DEMO_SPEED) - DRAFT_SECONDS;
}

function gameState(clock: number) {
  if (clock < -60) {
    return 'DOTA_GAMERULES_STATE_HERO_SELECTION';
  }
  if (clock < -30) {
    return 'DOTA_GAMERULES_STATE_STRATEGY_TIME';
  }
  if (clock < 0) {
    return 'DOTA_GAMERULES_STATE_PRE_GAME';
  }

  return clock <= DEMO_GAME_SECONDS
    ? 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
    : 'DOTA_GAMERULES_STATE_POST_GAME';
}

function deathAt(clock: number) {
  for (const at of DEATHS_AT) {
    if (clock >= at && clock < at + DEAD_FOR) {
      return at + DEAD_FOR - clock;
    }
  }

  return 0;
}

function countBefore(times: readonly number[], clock: number) {
  return times.filter((at) => clock >= at).length;
}

function building(alive: boolean): GsiBuilding {
  return { health: alive ? 1800 : 0, max_health: 1800 };
}

function towerBlock(prefix: string, fallen: number, raxFallen: number) {
  const block: Record<string, GsiBuilding> = {};
  let destroyed = 0;
  for (const tier of [1, 2, 3]) {
    for (const lane of TOWER_LANES) {
      block[`${prefix}_tower${tier}_${lane}`] = building(destroyed >= fallen);
      destroyed += 1;
    }
  }
  block[`${prefix}_tower4_top`] = building(true);
  block[`${prefix}_tower4_bot`] = building(true);

  let raxDestroyed = 0;
  for (const lane of TOWER_LANES) {
    for (const kind of ['melee', 'range'] as const) {
      block[`${prefix}_${kind}_rax_${lane}`] = building(raxDestroyed >= raxFallen);
      raxDestroyed += 1;
    }
  }
  block[`${prefix}_fort`] = { health: 4500, max_health: 4500 };

  return block;
}

/**
 * A synthetic packet in exactly the shape Dota posts, so the demo exercises the
 * same parser, event detection and frame code as a real game.
 */
export function demoPayload(elapsedMs: number, nowMs = Date.now()): GsiPayload {
  const clock = demoClock(elapsedMs);
  const minutes = Math.max(0, clock / 60);
  const state = gameState(clock);
  const respawn = deathAt(clock);
  const alive = respawn === 0;
  const finished = clock > DEMO_GAME_SECONDS;

  const kills = Math.floor(minutes * 0.42);
  const deaths = countBefore(DEATHS_AT, clock);
  const assists = Math.floor(minutes * 0.55);
  const level = Math.min(30, 1 + Math.floor(minutes * 0.75));
  const netWorth = Math.round(625 + minutes * 720);
  const drafting = clock < -30;

  return {
    provider: {
      name: 'Dota 2',
      appid: 570,
      version: 47,
      timestamp: Math.round(nowMs / 1000),
    },
    map: {
      name: 'start',
      matchid: '7000000001',
      game_time: clock + DRAFT_SECONDS,
      clock_time: clock,
      daytime: Math.floor(minutes / 5) % 2 === 0,
      nightstalker_night: false,
      game_state: state,
      paused: false,
      win_team: finished ? 'radiant' : 'none',
      customgamename: '',
      radiant_score: Math.floor(minutes * 1.15),
      dire_score: Math.floor(minutes * 0.95),
    },
    player: {
      steamid: '76561198000000001',
      accountid: '39734273',
      name: 'demo',
      activity: 'playing',
      kills,
      deaths,
      assists,
      last_hits: Math.round(minutes * 6.2),
      denies: Math.round(minutes * 0.6),
      kill_streak: kills > 0 ? Math.min(5, kills % 6) : 0,
      team_name: 'radiant',
      player_slot: 0,
      gold: Math.round(300 + (minutes % 7) * 260),
      gold_reliable: 200,
      gold_unreliable: 400,
      gpm: Math.round(360 + minutes * 6),
      xpm: Math.round(420 + minutes * 7),
      net_worth: netWorth,
    },
    hero: {
      id: drafting ? 0 : HERO_ID,
      name: drafting ? '' : HERO_KEY,
      level,
      xp: level * 900,
      alive,
      respawn_seconds: respawn,
      buyback_cost: Math.round(200 + netWorth * 0.09),
      buyback_cooldown: 0,
      health: 1000,
      max_health: 1200,
      health_percent: alive ? healthCurve(clock) : 0,
      mana: 300,
      max_mana: 600,
      mana_percent: alive ? 50 + Math.round(40 * Math.sin(minutes)) : 0,
      aghanims_scepter: minutes > 22,
      aghanims_shard: minutes > 15,
      smoked: false,
      has_debuff: false,
    },
    items: {
      slot0: { name: 'item_power_treads', can_cast: false, cooldown: 0, passive: true },
      slot1: { name: 'item_bfury', can_cast: false, cooldown: 0, passive: true },
      slot2: { name: 'item_manta', can_cast: true, cooldown: 0, passive: false },
      slot3: { name: 'item_black_king_bar', can_cast: true, cooldown: 0, passive: false },
    },
    buildings: {
      radiant: towerBlock('dota_goodguys', countBefore(MY_TOWER_FALLS, clock), 0),
      dire: towerBlock(
        'dota_badguys',
        countBefore(THEIR_TOWER_FALLS, clock),
        countBefore(THEIR_RAX_FALLS, clock),
      ),
    },
  };
}

function healthCurve(clock: number) {
  const nearDeath = DEATHS_AT.some((at) => clock >= at - 20 && clock < at);

  return nearDeath ? 14 : 60 + Math.round(35 * Math.abs(Math.sin(clock / 90)));
}
