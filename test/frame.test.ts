import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONT_WIDTH, FRONT } from '../src/bar/layout';
import { OFFLINE } from '../src/domain/state';
import { buildFrame, WAITING_TEXT } from '../src/view/frame';
import { formatGold } from 'busybar-kit/format';
import { account, atGameSecond, frameOptions, NOW, valueOf } from './helpers';

test('nothing from Dota means the setup screen, not a blank one', () => {
  const frame = buildFrame(OFFLINE, frameOptions({ note: 'GSI http://127.0.0.1:3080/' }));

  assert.equal(frame.mode, 'offline');
  assert.equal(frame.bigText, 'DOTA');
  assert.equal(frame.backSub, 'GSI http://127.0.0.1:3080/');
  assert.ok(frame.tickerText.length > 0, 'the front says what it is waiting for');
});

test('the menu says it is waiting, and keeps the account off the big line', () => {
  const menu = { ...OFFLINE, present: true, phase: 'menu' as const, updatedAtMs: NOW };
  const frame = buildFrame(menu, frameOptions({ account: account() }));

  assert.equal(frame.mode, 'idle');
  assert.ok(frame.bigOnly, 'the waiting line owns the whole strip');
  assert.ok(
    WAITING_TEXT.startsWith(frame.bigText),
    `"${frame.bigText}" should be a page of "${WAITING_TEXT}"`,
  );
  // A bare "4-2" in the big font is what used to read as a live team score.
  assert.equal(frame.clockText, '');
  assert.equal(frame.scoreText, '');
  assert.equal(frame.backHeader, 'Waiting for the game');
  assert.equal(valueOf(frame.backRows, 'STREAK'), 'W3');
  assert.equal(valueOf(frame.backRows, 'LAST'), 'WIN');
});

test('the menu without account stats still says what it is waiting for', () => {
  const menu = { ...OFFLINE, present: true, phase: 'menu' as const, updatedAtMs: NOW };
  const frame = buildFrame(menu, frameOptions({ note: 'GSI http://127.0.0.1:3080/' }));

  assert.equal(frame.mode, 'idle');
  assert.ok(frame.bigOnly);
  assert.equal(frame.backHeader, 'Waiting for the game');
  assert.equal(frame.backSub, 'GSI http://127.0.0.1:3080/');
});

test('the waiting line reads out the whole sentence over time', () => {
  const menu = { ...OFFLINE, present: true, phase: 'menu' as const, updatedAtMs: NOW };
  const seen = new Set<string>();
  for (let step = 0; step < 12; step += 1) {
    seen.add(buildFrame(menu, frameOptions({ nowEpochMs: NOW + step * 1000 })).bigText);
  }

  assert.ok(seen.size > 1, 'the line pages rather than sitting still');
  assert.ok(
    [...seen].every((page) => WAITING_TEXT.includes(page.trim())),
    `every page should come from "${WAITING_TEXT}": ${[...seen].join(' | ')}`,
  );
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

test('being dead shows the countdown, and under it the buyback and my gold', () => {
  const frame = buildFrame(atGameSecond(8 * 60 + 10), frameOptions());

  assert.equal(frame.mode, 'dead');
  assert.match(frame.bigText, /^\d+$/);
  assert.ok(frame.buybackText, 'the buyback shares the strip with the countdown');
  assert.ok(frame.goldText, 'so does the gold it has to be paid with');
  // The clock row would land on the same pixels, so it stands down.
  assert.equal(frame.clockText, '');
  assert.equal(frame.scoreText, '');
  assert.equal(frame.worthText, '');
  assert.ok(valueOf(frame.backRows, 'DEAD'));
  assert.ok(valueOf(frame.backRows, 'BUY'));
  assert.ok(valueOf(frame.backRows, 'GOLD'));
  assert.equal(valueOf(frame.backRows, 'HP'), null);
});

test('the buyback reads as ready, short of gold, or on cooldown', () => {
  const state = atGameSecond(8 * 60 + 10);
  const cost = state.hero!.buybackCost;

  const short = buildFrame(
    { ...state, player: { ...state.player!, gold: cost - 1 } },
    frameOptions(),
  );
  assert.equal(short.buybackTone, 'short');
  assert.equal(short.buybackText, `BUY ${formatGold(cost)}`);

  const ready = buildFrame(
    { ...state, player: { ...state.player!, gold: cost } },
    frameOptions(),
  );
  assert.equal(ready.buybackTone, 'ready');
  assert.equal(ready.buybackText, `BUY ${formatGold(cost)}`);

  const waiting = buildFrame(
    {
      ...state,
      hero: { ...state.hero!, buybackCooldownSec: 72 },
      player: { ...state.player!, gold: cost * 2 },
    },
    frameOptions(),
  );
  assert.equal(waiting.buybackTone, 'cooldown');
  assert.equal(waiting.buybackText, 'CD 1:12', 'a price and a timer must not look alike');
});

test('the back keeps the price even while the buyback is on cooldown', () => {
  const state = atGameSecond(8 * 60 + 10);
  const cost = state.hero!.buybackCost;
  const waiting = buildFrame(
    { ...state, hero: { ...state.hero!, buybackCooldownSec: 72 } },
    frameOptions(),
  );

  assert.equal(valueOf(waiting.backRows, 'BUY'), formatGold(cost));
  assert.equal(valueOf(waiting.backRows, 'CD'), '1:12');

  // Ready again, and the cooldown cell costs nothing because it is not there.
  const ready = buildFrame(state, frameOptions());
  assert.equal(valueOf(ready.backRows, 'CD'), null);
});

test('the dead bottom row fits the 72px front alongside the gold', () => {
  const state = atGameSecond(8 * 60 + 10);
  const frame = buildFrame(
    {
      ...state,
      hero: { ...state.hero!, buybackCost: 12_345 },
      player: { ...state.player!, gold: 23_456 },
    },
    frameOptions(),
  );
  const used = (frame.buybackText.length + frame.goldText.length) * FONT_WIDTH.tiny;

  assert.ok(
    used <= FRONT.width - 4,
    `"${frame.buybackText}" and "${frame.goldText}" collide`,
  );
});

test('the big line always fits the 72px front', () => {
  const seconds = [-75, 0, 8 * 60 + 10, 20 * 60, 31 * 60];
  for (const second of seconds) {
    const frame = buildFrame(atGameSecond(second), frameOptions());
    assert.ok(
      frame.bigText.length * FONT_WIDTH[frame.bigFont] <= FRONT.width,
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
