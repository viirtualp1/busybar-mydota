import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentStreak,
  formatRank,
  parseRecentMatches,
  STEAM_ID64_BASE,
  toAccountId,
  todayRecord,
  type RecentMatch,
} from '../src/account/opendota';

test('a 64-bit steam id becomes the 32-bit account id OpenDota wants', () => {
  assert.equal(
    toAccountId('76561198000000001'),
    Number(76561198000000001n - STEAM_ID64_BASE),
  );
  assert.equal(toAccountId('  76561198000000001  '), 39_734_273);
});

test('an account id that is already 32-bit is left alone', () => {
  assert.equal(toAccountId('39734273'), 39_734_273);
});

test('anything that is not a steam id is refused rather than guessed at', () => {
  assert.equal(toAccountId(''), null);
  assert.equal(toAccountId('STEAM_0:1:19867136'), null);
  assert.equal(toAccountId('0'), null);
});

test('rank tiers read as medals, and the top one as a leaderboard place', () => {
  assert.equal(formatRank(75, null), 'Divine 5');
  assert.equal(formatRank(11, null), 'Herald 1');
  assert.equal(formatRank(80, 412), 'Immortal #412');
  assert.equal(formatRank(80, null), 'Immortal');
  assert.equal(formatRank(null, null), '');
  assert.equal(formatRank(0, null), '');
});

test('a win is read off the player slot against the radiant result', () => {
  const matches = parseRecentMatches([
    {
      match_id: 1,
      hero_id: 8,
      player_slot: 0,
      radiant_win: true,
      kills: 5,
      deaths: 1,
      assists: 3,
      duration: 1800,
      start_time: 1_700_000_000,
    },
    {
      match_id: 2,
      hero_id: 9,
      player_slot: 132,
      radiant_win: true,
      kills: 2,
      deaths: 8,
      assists: 4,
      duration: 2400,
      start_time: 1_700_000_100,
    },
  ]);

  assert.equal(matches.length, 2);
  assert.equal(matches[0]?.win, true);
  assert.equal(matches[1]?.win, false);
  assert.equal(matches[0]?.startedAtMs, 1_700_000_000_000);
});

test('entries missing the fields that decide a win are skipped', () => {
  assert.deepEqual(parseRecentMatches([{ match_id: 1 }, { player_slot: 0 }]), []);
  assert.deepEqual(parseRecentMatches(null), []);
});

function match(win: boolean, startedAtMs: number): RecentMatch {
  return {
    matchId: '1',
    heroId: 8,
    win,
    kills: 1,
    deaths: 1,
    assists: 1,
    durationSec: 1800,
    startedAtMs,
  };
}

test("today's record counts from local midnight, not the last 24 hours", () => {
  const now = new Date(2026, 7, 16, 18, 0, 0).getTime();
  const morning = new Date(2026, 7, 16, 9, 0, 0).getTime();
  const lastNight = new Date(2026, 7, 15, 23, 0, 0).getTime();

  const record = todayRecord(
    [match(true, morning), match(false, morning), match(true, lastNight)],
    now,
  );

  assert.deepEqual(record, { wins: 1, losses: 1 });
});

test('the streak runs from the newest match until the result changes', () => {
  const now = Date.now();
  assert.deepEqual(
    currentStreak([match(true, now), match(true, now), match(false, now)]),
    { kind: 'W', length: 2 },
  );
  assert.deepEqual(currentStreak([match(false, now), match(true, now)]), {
    kind: 'L',
    length: 1,
  });
  assert.equal(currentStreak([]), null);
});
