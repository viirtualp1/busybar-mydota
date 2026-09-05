import assert from 'node:assert/strict';
import { test } from 'node:test';
import { App } from '../src/app';
import type { BarDisplay } from '../src/bar/display';
import { loadConfig } from '../src/config';
import { inMatch } from '../src/domain/state';
import { HeroCatalog } from '../src/dota/heroes';
import { demoPayload } from '../src/gsi/demo';
import { GsiServer } from '../src/gsi/server';
import { buildFrame } from '../src/view/frame';
import { frameOptions, NOW } from './helpers';

/** Enough of a display to construct the App; nothing here draws. */
const display = {
  ping: async () => {},
  markStale: () => {},
  stop: () => {},
  push: async () => {},
  playEvent: async () => {},
  blank: async () => {},
  clear: async () => {},
} as unknown as BarDisplay;

const silent = { info: () => {}, warn: () => {} };

/** The menu shape Dota posts once you are out of a game: no `map` block. */
const MENU = { provider: { name: 'Dota 2', appid: 570, version: 1, timestamp: 1 } };

function app() {
  const gsi = new GsiServer({ port: 0, host: '127.0.0.1', token: '', staleMs: 30_000 });
  const { config } = loadConfig({ DEMO: '1' }, []);
  const instance = new App({
    config,
    gsi,
    heroes: new HeroCatalog(),
    display,
    logger: silent,
  });

  return { app: instance, gsi };
}

/** The synthetic game at 31:00, which is past its own finish. */
function finishedPayload() {
  return demoPayload(((31 * 60 + 90) / 20) * 1000, NOW);
}

test('a finished game is held while Dota goes quiet on us', () => {
  const { app: instance, gsi } = app();
  gsi.accept(finishedPayload(), NOW);

  const held = instance.view(NOW + 1000);
  assert.ok(inMatch(held), 'the result stays up when nothing else arrives');
  assert.notEqual(held.winner, null);
});

test('leaving a game drops the result instead of freezing the score', () => {
  const { app: instance, gsi } = app();
  gsi.accept(finishedPayload(), NOW);
  assert.notEqual(instance.view(NOW + 1000).winner, null);

  // Back to the menu: Dota keeps posting, but without a match in the payload.
  gsi.accept(MENU, NOW + 2000);

  const after = instance.view(NOW + 2500);
  assert.ok(!inMatch(after), 'the held result must not survive a return to the menu');
  assert.equal(after.phase, 'menu');

  const frame = buildFrame(after, frameOptions({ nowEpochMs: NOW + 2500 }));
  assert.equal(frame.mode, 'idle');
  assert.equal(frame.backHeader, 'Waiting for the game');
});

test('a stale feed falls back to the offline screen, not the last score', () => {
  const { app: instance, gsi } = app();
  gsi.accept(finishedPayload(), NOW);

  const late = instance.view(NOW + 120_000);
  assert.equal(late.phase, 'offline');
});
