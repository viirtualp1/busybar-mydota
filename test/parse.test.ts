import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePayload } from '../src/gsi/parse';
import type { GsiPayload } from '../src/gsi/types';
import { inMatch, isPlaying, myScore, outcome, theirScore } from '../src/domain/state';
import { NOW } from './helpers';

function playing(overrides: Partial<GsiPayload> = {}): GsiPayload {
  return {
    provider: { name: 'Dota 2', appid: 570 },
    map: {
      name: 'start',
      matchid: '7123456789',
      game_time: 900,
      clock_time: 840,
      daytime: true,
      game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      paused: false,
      win_team: 'none',
      radiant_score: 10,
      dire_score: 14,
    },
    player: {
      steamid: '76561198000000001',
      name: 'tester',
      team_name: 'dire',
      kills: 5,
      deaths: 2,
      assists: 7,
      last_hits: 104,
      denies: 11,
      kill_streak: 3,
      gold: 1200,
      gpm: 520,
      xpm: 610,
      net_worth: 9000,
    },
    hero: {
      id: 8,
      name: 'npc_dota_hero_juggernaut',
      level: 12,
      alive: true,
      respawn_seconds: 0,
      buyback_cost: 1100,
      buyback_cooldown: 0,
      health_percent: 90,
      mana_percent: 66,
    },
    items: {
      slot0: { name: 'item_power_treads' },
      slot1: { name: 'empty' },
      slot2: { name: 'item_manta', cooldown: 4, charges: 2 },
    },
    ...overrides,
  };
}

test('a menu payload is present but not a match', () => {
  const state = parsePayload({ provider: { name: 'Dota 2' } }, NOW);
  assert.equal(state.present, true);
  assert.equal(state.phase, 'menu');
  assert.equal(inMatch(state), false);
});

test('a live payload becomes my seat in the match', () => {
  const state = parsePayload(playing(), NOW);

  assert.equal(state.phase, 'live');
  assert.equal(inMatch(state), true);
  assert.equal(isPlaying(state), true);
  assert.equal(state.matchId, '7123456789');
  assert.equal(state.clockSec, 840);
  assert.equal(state.side, 'dire');
  assert.equal(state.spectating, false);
  assert.equal(state.steamId, '76561198000000001');
  assert.deepEqual(state.player, {
    kills: 5,
    deaths: 2,
    assists: 7,
    lastHits: 104,
    denies: 11,
    killStreak: 3,
    gold: 1200,
    gpm: 520,
    xpm: 610,
    netWorth: 9000,
  });
  assert.equal(state.hero?.id, 8);
  assert.equal(state.hero?.level, 12);
});

test('my score is my own side, whichever side that is', () => {
  const state = parsePayload(playing(), NOW);
  assert.equal(myScore(state), 14);
  assert.equal(theirScore(state), 10);
});

test('empty item slots are dropped, real ones keep cooldown and charges', () => {
  const state = parsePayload(playing(), NOW);

  assert.deepEqual(
    state.items.map((item) => item.name),
    ['item_power_treads', 'item_manta'],
  );
  assert.equal(state.items[1]?.cooldownSec, 4);
  assert.equal(state.items[1]?.charges, 2);
});

test('a dead hero reports a respawn timer', () => {
  const state = parsePayload(
    playing({
      hero: {
        id: 8,
        name: 'npc_dota_hero_juggernaut',
        level: 12,
        alive: false,
        respawn_seconds: 31,
        buyback_cost: 1100,
        buyback_cooldown: 0,
        health_percent: 0,
        mana_percent: 0,
      },
    }),
    NOW,
  );

  assert.equal(state.hero?.alive, false);
  assert.equal(state.hero?.respawnSec, 31);
});

test('buildings count what is still standing, on either report style', () => {
  const state = parsePayload(
    playing({
      buildings: {
        radiant: {
          dota_goodguys_tower1_top: { health: 1800, max_health: 1800 },
          dota_goodguys_tower1_mid: { health: 0, max_health: 1800 },
          dota_goodguys_melee_rax_top: { health: 2200, max_health: 2200 },
          dota_goodguys_fort: { health: 2250, max_health: 4500 },
        },
        // A destroyed building can simply be missing from the block.
        dire: {
          dota_badguys_tower1_top: { health: 1800, max_health: 1800 },
          dota_badguys_tower1_mid: { health: 1800, max_health: 1800 },
          dota_badguys_fort: { health: 4500, max_health: 4500 },
        },
      },
    }),
    NOW,
  );

  assert.deepEqual(state.radiantBuildings, {
    towers: 1,
    racks: 1,
    ancientPercent: 50,
  });
  assert.deepEqual(state.direBuildings, { towers: 2, racks: 0, ancientPercent: 100 });
});

test('a win_team turns into a win or loss from my seat', () => {
  const won = parsePayload(
    playing({
      map: {
        matchid: '7123456789',
        clock_time: 2100,
        game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        win_team: 'dire',
        radiant_score: 20,
        dire_score: 31,
      },
    }),
    NOW,
  );

  assert.equal(won.phase, 'postgame');
  assert.equal(won.winner, 'dire');
  assert.equal(outcome(won), 'win');

  const lost = parsePayload(
    playing({
      map: {
        matchid: '7123456789',
        clock_time: 2100,
        game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        win_team: 'radiant',
      },
    }),
    NOW,
  );
  assert.equal(outcome(lost), 'loss');
});

test('the spectator shape is recognised instead of read as my own stats', () => {
  const state = parsePayload(
    playing({
      player: { team2: { player0: { kills: 3, name: 'someone' } } },
      hero: { team2: { player0: { id: 5, level: 9 } } },
    }),
    NOW,
  );

  assert.equal(state.spectating, true);
  assert.equal(state.player, null);
  assert.equal(state.hero, null);
  assert.equal(state.side, null);
});

test('the draft states are their own phase', () => {
  for (const [gameState, phase] of [
    ['DOTA_GAMERULES_STATE_HERO_SELECTION', 'draft'],
    ['DOTA_GAMERULES_STATE_STRATEGY_TIME', 'strategy'],
    ['DOTA_GAMERULES_STATE_PRE_GAME', 'pregame'],
  ] as const) {
    const state = parsePayload(
      playing({ map: { matchid: '1', game_state: gameState, clock_time: -30 } }),
      NOW,
    );
    assert.equal(state.phase, phase);
  }
});

test('an unknown game state falls back to the menu rather than guessing', () => {
  const state = parsePayload(
    playing({ map: { matchid: '1', game_state: 'DOTA_GAMERULES_STATE_FUTURE' } }),
    NOW,
  );

  assert.equal(state.phase, 'menu');
});
