import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEvent, initialEventState, stateOf } from '../src/domain/events';
import type { MatchState } from '../src/domain/state';
import { atGameSecond } from './helpers';

function step(before: MatchState, after: MatchState) {
  return detectEvent(stateOf(before), after).event;
}

test('the first sighting of a match never fires anything', () => {
  const state = atGameSecond(10 * 60);
  assert.equal(detectEvent(initialEventState, state).event, null);
});

test('a new match id rebaselines instead of firing a burst', () => {
  const previous = stateOf(atGameSecond(20 * 60));
  const next = { ...atGameSecond(60), matchId: '7999999999' };

  assert.equal(detectEvent(previous, next).event, null);
});

test('a death beats a kill in the same tick', () => {
  const before = atGameSecond(8 * 60 - 30);
  const after = { ...atGameSecond(8 * 60 + 5) };
  after.player = { ...after.player!, kills: before.player!.kills + 1 };

  const event = step(before, after);
  assert.equal(event?.kind, 'death');
  assert.equal(event.tone, 'bad');
});

test('a kill reports how many came at once', () => {
  const before = atGameSecond(12 * 60);
  const after = { ...before };
  after.player = { ...before.player!, kills: before.player!.kills + 2, killStreak: 2 };

  const event = step(before, after);
  assert.equal(event?.kind, 'kill');
  assert.equal(event.text, '2 kills');
  assert.equal(event.tone, 'good');
});

test('a third kill in a row is a spree, not another kill line', () => {
  const start = atGameSecond(12 * 60);
  const before = { ...start, player: { ...start.player!, killStreak: 2 } };
  const after = {
    ...before,
    player: { ...before.player, kills: before.player.kills + 1, killStreak: 3 },
  };

  const event = step(before, after);
  assert.equal(event?.kind, 'streak');
  assert.equal(event.text, 'Killing spree');
});

test('losing a tower and taking one read differently', () => {
  const before = atGameSecond(12 * 60);

  const lost = step(before, {
    ...before,
    radiantBuildings: {
      ...before.radiantBuildings!,
      towers: before.radiantBuildings!.towers - 1,
    },
  });
  assert.equal(lost?.kind, 'tower');
  assert.equal(lost.text, 'Our tower fell');
  assert.equal(lost.tone, 'bad');

  const taken = step(before, {
    ...before,
    direBuildings: {
      ...before.direBuildings!,
      towers: before.direBuildings!.towers - 1,
    },
  });
  assert.equal(taken?.kind, 'tower');
  assert.equal(taken.text, 'Their tower fell');
  assert.equal(taken.tone, 'good');
});

test('barracks outrank towers when both fall in one step', () => {
  const before = atGameSecond(27 * 60);
  const after = {
    ...before,
    radiantBuildings: {
      ...before.radiantBuildings!,
      towers: before.radiantBuildings!.towers - 1,
    },
    direBuildings: {
      ...before.direBuildings!,
      racks: before.direBuildings!.racks - 1,
    },
  };

  const event = step(before, after);
  assert.equal(event?.kind, 'racks');
  assert.equal(event.text, 'Their rax fell');
});

test('the horn is announced once the game is in progress', () => {
  const event = step(atGameSecond(-10), atGameSecond(5));
  assert.equal(event?.kind, 'match-start');
  assert.equal(event.text, 'Game on');
});

test('the result is announced from my seat', () => {
  const before = atGameSecond(29 * 60);
  const win = atGameSecond(31 * 60);
  const won = step(before, win);
  assert.equal(won?.kind, 'match-end');
  assert.equal(won.text, 'Victory');

  const loss = { ...win, winner: 'dire' as const };
  const lost = step(before, loss);
  assert.equal(lost?.text, 'Defeat');
});

test('the result only fires once, not on every packet after it', () => {
  const finished = atGameSecond(31 * 60);
  const first = detectEvent(stateOf(atGameSecond(29 * 60)), finished);
  assert.equal(first.event?.kind, 'match-end');
  assert.equal(detectEvent(first.state, finished).event, null);
});

test('a level up is quiet but still shown', () => {
  const before = atGameSecond(12 * 60);
  const after = { ...before, hero: { ...before.hero!, level: before.hero!.level + 1 } };

  const event = step(before, after);
  assert.equal(event?.kind, 'level');
  assert.equal(event.sound, false);
});

test('dropping into low health warns once, not on every packet', () => {
  const healthy = atGameSecond(12 * 60);
  const hurt = { ...healthy, hero: { ...healthy.hero!, healthPercent: 12 } };

  const first = detectEvent(stateOf(healthy), hurt);
  assert.equal(first.event?.kind, 'low-hp');
  assert.equal(detectEvent(first.state, hurt).event, null);
});
