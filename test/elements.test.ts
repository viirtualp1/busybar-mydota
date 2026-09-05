import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TextElement } from '@busy-app/busy-lib';
import { frontElements } from '../src/bar/elements';
import { FONT_WIDTH, FRONT } from '../src/bar/layout';
import { buildFrame } from '../src/view/frame';
import { atGameSecond, frameOptions } from './helpers';

const MID_X = Math.floor(FRONT.width / 2);

function texts(second: number) {
  const frame = buildFrame(atGameSecond(second), frameOptions());
  const found = new Map<string, TextElement>();
  for (const element of frontElements(frame)) {
    if (element.type === 'text') {
      found.set(element.id, element);
    }
  }

  return found;
}

const LIVE = 20 * 60;
const DEAD = 8 * 60 + 10;

/**
 * In the Bar's API `width` on a text element declares a fixed-width *label*
 * (the box the scroll_* fields animate) and the anchor applies to that box,
 * with the text at its left edge. A centred label therefore lands left of
 * centre and a right-anchored one stops short of the edge — which is exactly
 * what these fields used to do on the device.
 */
test('no front label carries a width, so anchors apply to the text itself', () => {
  for (const second of [LIVE, DEAD, -75, 31 * 60]) {
    for (const [id, element] of texts(second)) {
      assert.equal(element.width, undefined, `${id} at ${second}s still sets a width`);
    }
  }
});

test('the score sits on the middle of the strip and the gold on its right edge', () => {
  const front = texts(LIVE);

  const score = front.get('score');
  assert.equal(score?.align, 'top_mid');
  assert.equal(score?.x, MID_X);
  assert.ok((score?.text ?? '').trim().length > 0, 'the live score is drawn');

  const worth = front.get('worth');
  assert.equal(worth?.align, 'top_right');
  assert.equal(worth?.x, FRONT.width - 1);
  assert.ok((worth?.text ?? '').trim().length > 0, 'the live net worth is drawn');

  // The clock is the reference: it was already flush against its own edge.
  const clock = front.get('clock');
  assert.equal(clock?.align, 'top_left');
  assert.equal(clock?.x, 1);
});

test('each bottom field stays inside its own slot', () => {
  const front = texts(LIVE);
  const budget: Record<string, number> = {
    clock: FRONT.clockWidth,
    score: FRONT.scoreWidth,
    worth: FRONT.worthWidth,
  };

  for (const [id, width] of Object.entries(budget)) {
    const element = front.get(id);
    assert.ok(
      (element?.text.length ?? 0) * FONT_WIDTH.tiny <= width,
      `"${element?.text ?? ''}" overflows the ${id} slot`,
    );
  }
});

test('the dead screen is the timer alone, centred on both axes', () => {
  const front = texts(DEAD);

  const big = front.get('big');
  assert.equal(big?.align, 'center');
  assert.equal(big?.x, MID_X);
  assert.equal(big?.y, Math.floor(FRONT.height / 2));
  assert.match(big?.text ?? '', /^\d+$/);

  for (const id of ['clock', 'score', 'worth', 'ticker']) {
    assert.equal(front.get(id)?.text.trim(), '', `${id} should be blank while dead`);
  }
});

test('a live screen anchors the big line to the top, not the middle', () => {
  const big = texts(LIVE).get('big');

  assert.equal(big?.align, 'top_mid');
  assert.equal(big?.y, FRONT.topY);
});

test('a death never puts wording on the strip, even once I am back up', () => {
  const alive = atGameSecond(LIVE);
  const frame = buildFrame(
    alive,
    frameOptions({
      ticker: {
        event: { kind: 'death', tone: 'bad', text: '', priority: 80, sound: true },
        elapsedMs: 0,
      },
    }),
  );

  assert.equal(frame.tickerText, '');
  const ticker = frontElements(frame).find(
    (element) => element.type === 'text' && element.id === 'ticker',
  );
  assert.equal(ticker?.type === 'text' ? ticker.text.trim() : null, '');
});
