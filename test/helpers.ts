import { BACK } from '../src/bar/layout';
import type { AccountStats } from '../src/account/opendota';
import { HeroCatalog } from '../src/dota/heroes';
import { demoPayload } from '../src/gsi/demo';
import { parsePayload } from '../src/gsi/parse';
import type { MatchState } from '../src/domain/state';
import { FRONT_LINE_CHARS, type FrameOptions } from '../src/view/frame';

export const heroes = new HeroCatalog();

export const NOW = Date.UTC(2026, 7, 16, 6, 0, 0);

export function frameOptions(overrides: Partial<FrameOptions> = {}): FrameOptions {
  return {
    heroes,
    maxRows: BACK.maxRows,
    ticker: null,
    nowEpochMs: NOW,
    account: null,
    note: '',
    tickerStyle: 'page',
    tickerChars: FRONT_LINE_CHARS,
    ...overrides,
  };
}

/** The synthetic game frozen at one point on its clock. */
export function atGameSecond(second: number): MatchState {
  return parsePayload(demoPayload(((second + 90) / 20) * 1000, NOW), NOW);
}

export function account(overrides: Partial<AccountStats> = {}): AccountStats {
  return {
    accountId: 39_734_273,
    personaName: 'tester',
    rank: 'Divine 3',
    today: { wins: 4, losses: 2 },
    streak: { kind: 'W', length: 3 },
    last: {
      matchId: '7000000001',
      heroId: 8,
      win: true,
      kills: 12,
      deaths: 3,
      assists: 15,
      durationSec: 38 * 60 + 20,
      startedAtMs: NOW - 3_600_000,
    },
    fetchedAtMs: NOW,
    ...overrides,
  };
}

export function valueOf(
  rows: readonly {
    left: { label: string; value: string } | null;
    right: { label: string; value: string } | null;
  }[],
  label: string,
) {
  for (const row of rows) {
    for (const cell of [row.left, row.right]) {
      if (cell?.label === label) {
        return cell.value;
      }
    }
  }

  return null;
}
