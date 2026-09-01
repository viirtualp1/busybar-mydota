import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRONT } from '../src/bar/layout';
import { OFFLINE } from '../src/domain/state';
import { buildFrame } from '../src/view/frame';
import { account, atGameSecond, frameOptions, NOW, valueOf } from './helpers';

test('nothing from Dota means the setup screen, not a blank one', () => {
  const frame = buildFrame(OFFLINE, frameOptions({ note: 'GSI http://127.0.0.1:3080/' }));

  assert.equal(frame.mode, 'offline');
  assert.equal(frame.bigText, 'DOTA');
  assert.equal(frame.backSub, 'GSI http://127.0.0.1:3080/');
  assert.ok(frame.tickerText.length > 0, 'the front says what it is waiting for');
});

test('the menu shows the account, not an empty match', () => {
  const menu = { ...OFFLINE, present: true, phase: 'menu' as const, updatedAtMs: NOW };
  const frame = buildFrame(menu, frameOptions({ account: account() }));

  assert.equal(frame.mode, 'idle');
  assert.equal(frame.bigText, '4-2');
  assert.equal(frame.clockText, 'TODAY');
  assert.equal(valueOf(frame.backRows, 'STREAK'), 'W3');
  assert.equal(valueOf(frame.backRows, 'LAST'), 'WIN');
});

test('the menu without account stats still says something', () => {
  const menu = { ...OFFLINE, present: true, phase: 'menu' as const, updatedAtMs: NOW };
  const frame = buildFrame(menu, frameOptions());

  assert.equal(frame.mode, 'idle');
  assert.equal(frame.bigText, 'IDLE');
});

test('a live game puts my KDA on the front and my stats on the back', () => {
  const frame = buildFrame(atGameSecond(20 * 60), frameOptions());

  assert.equal(frame.mode, 'live');
  assert.match(frame.bigText, /^\d+\/\d+\/\d+$/);
  assert.equal(frame.clockText, '20:00');
  assert.match(frame.scoreText, /^\d+-\d+$/);
  assert.equal(valueOf(frame.backRows, 'KDA'), frame.bigText);
  assert.ok(valueOf(frame.backRows, 'GPM'));
  assert.ok(valueOf(frame.backRows, 'HP'));
  assert.ok(frame.showBands);
});

test('being dead replaces the KDA with the respawn timer', () => {
  const frame = buildFrame(atGameSecond(8 * 60 + 10), frameOptions());

  assert.equal(frame.mode, 'dead');
  assert.match(frame.bigText, /^DEAD \d+$/);
  assert.ok(valueOf(frame.backRows, 'DEAD'));
  assert.ok(valueOf(frame.backRows, 'BUY'));
  assert.equal(valueOf(frame.backRows, 'HP'), null);
});

test('the big line always fits the 72px front', () => {
  const seconds = [-75, 0, 8 * 60 + 10, 20 * 60, 31 * 60];
  for (const second of seconds) {
    const frame = buildFrame(atGameSecond(second), frameOptions());
    assert.ok(
      frame.bigText.length * 8 <= FRONT.width,
      `"${frame.bigText}" is too wide for the front display`,
    );
  }
});

test('the draft says so instead of showing a 0/0/0 KDA', () => {
  const frame = buildFrame(atGameSecond(-75), frameOptions());

  assert.equal(frame.mode, 'draft');
  assert.equal(frame.bigText, 'DRAFT');
  assert.equal(valueOf(frame.backRows, 'SIDE'), 'RADIANT');
});

test('a finished game reads as a win or a loss, whichever side I was', () => {
  const won = buildFrame(atGameSecond(31 * 60), frameOptions());
  assert.equal(won.mode, 'postgame');
  assert.equal(won.bigText, 'VICTORY');

  const state = atGameSecond(31 * 60);
  const lost = buildFrame({ ...state, winner: 'dire' }, frameOptions());
  assert.equal(lost.bigText, 'DEFEAT');
});

test('an event takes over the bottom row while it runs', () => {
  const state = atGameSecond(20 * 60);
  const withEvent = buildFrame(
    state,
    frameOptions({
      ticker: {
        event: {
          kind: 'kill',
          tone: 'good',
          text: 'Kill',
          priority: 60,
          sound: true,
        },
        elapsedMs: 0,
      },
    }),
  );

  assert.equal(withEvent.tickerText, 'Kill');
  assert.equal(withEvent.ledColor, '#3FBF5FFF');
});

test('the band never collapses to nothing, however lopsided the score', () => {
  const state = atGameSecond(20 * 60);
  const blowout = buildFrame(
    { ...state, radiantScore: 60, direScore: 0 },
    frameOptions(),
  );
  const reverse = buildFrame(
    { ...state, radiantScore: 0, direScore: 60 },
    frameOptions(),
  );

  assert.ok(blowout.myFill > 0 && blowout.myFill < FRONT.width);
  assert.ok(reverse.myFill > 0 && reverse.myFill < FRONT.width);
});

test('spectating falls back to the two team scores', () => {
  const state = atGameSecond(20 * 60);
  const frame = buildFrame(
    { ...state, spectating: true, side: null, player: null, hero: null },
    frameOptions(),
  );

  assert.equal(frame.mode, 'spectate');
  assert.equal(frame.bigText, `${state.radiantScore}-${state.direScore}`);
});
