#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AccountStats } from './account/opendota';
import { AccountSource, toAccountId } from './account/opendota';
import { backElements, frontElements } from './bar/elements';
import { BACK } from './bar/layout';
import { loadConfig, loadEnvFile } from './config';
import { detectEvent, stateOf, type MatchEvent } from './domain/events';
import { OFFLINE, type MatchState } from './domain/state';
import { HeroCatalog } from './dota/heroes';
import { demoPayload } from './gsi/demo';
import { parsePayload } from './gsi/parse';
import { renderBack, renderFront } from 'busybar-kit/preview';
import { buildFrame, type MyFrame } from './view/frame';

const SCALE = 8;

/** Points in the synthetic game each shot is taken from, in game seconds. */
const SEEK = {
  draft: -75,
  live: 20 * 60,
  dead: 8 * 60 + 10,
  result: 31 * 60,
} as const;

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);
const pick = <T extends string>(...names: T[]) =>
  names.find((name) => argv.includes(`--${name}`));

const shot = pick('draft', 'dead', 'result', 'idle', 'offline', 'live') ?? 'live';
const withEvent = argv.includes('--event');

const heroes = new HeroCatalog();
if (!(await heroes.load())) {
  console.warn('Hero names unavailable — the shot will show hero ids');
}

const match = capture(shot);
const frame = buildFrame(match, {
  heroes,
  maxRows: BACK.maxRows,
  ticker: withEvent ? captureEvent() : null,
  nowEpochMs: Date.now(),
  account: shot === 'idle' ? await captureAccount() : null,
  note: `GSI http://${config.gsiHost}:${config.gsiPort}/`,
  tickerStyle: config.tickerStyle,
  tickerChars: config.tickerChars,
});

write('preview-front.png', renderFront(frontElements(frame)).scale(SCALE).toPng());
write('preview-back.png', renderBack(backElements(frame)).scale(SCALE).toPng());
printAscii(frame);

function atGameSecond(second: number): MatchState {
  const elapsedMs = ((second + 90) / 20) * 1000;

  return parsePayload(demoPayload(elapsedMs), Date.now());
}

function capture(which: string): MatchState {
  switch (which) {
    case 'offline':
      return OFFLINE;
    case 'idle':
      return { ...OFFLINE, present: true, phase: 'menu', updatedAtMs: Date.now() };
    case 'draft':
      return atGameSecond(SEEK.draft);
    case 'dead':
      return atGameSecond(SEEK.dead);
    case 'result':
      return atGameSecond(SEEK.result);
    default:
      return atGameSecond(SEEK.live);
  }
}

function captureEvent(): { event: MatchEvent; elapsedMs: number } | null {
  const before = atGameSecond(SEEK.dead - 20);
  const after = atGameSecond(SEEK.dead);
  const event = detectEvent(stateOf(before), after).event;

  return event ? { event, elapsedMs: 0 } : null;
}

async function captureAccount(): Promise<AccountStats | null> {
  const accountId = config.steamId ? toAccountId(config.steamId) : null;
  if (accountId === null) {
    console.log('Account: none (set STEAM_ID for a real idle screen)');

    return demoAccount();
  }

  try {
    const stats = await new AccountSource({
      accountId,
      timeoutMs: config.requestTimeoutMs,
    }).poll();
    console.log(`Account: OpenDota player ${accountId}`);

    return stats;
  } catch (error) {
    console.warn(
      `Account lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return demoAccount();
  }
}

function demoAccount(): AccountStats {
  return {
    accountId: 0,
    personaName: 'demo',
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
      startedAtMs: Date.now() - 3_600_000,
    },
    fetchedAtMs: Date.now(),
  };
}

function write(name: string, data: Buffer) {
  const path = resolve(process.cwd(), name);
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
}

function printAscii(current: MyFrame) {
  console.log(`\n[${current.mode}]`);
  console.log('--- front 72x16 ---');
  if (current.bigOnly) {
    // The big line owns the strip; nothing else is drawn on it.
    console.log(`  ${current.bigText.padStart(10)}  (centred, alone)`);
  } else {
    console.log(`  ${current.bigText.padStart(10)}`);
    console.log(
      current.tickerText
        ? `  ticker: ${current.tickerText}`
        : current.buybackText || current.goldText
          ? `  ${current.buybackText.padEnd(11)}${current.goldText}  (${current.buybackTone})`
          : `  ${current.clockText.padEnd(7)}${current.scoreText.padEnd(7)}${current.worthText}`,
    );
  }
  const filled = Math.round(current.myFill / 3);
  console.log(
    `  band: ${'#'.repeat(filled)}${'.'.repeat(Math.max(0, 24 - filled))}  (${current.myFill}/72px mine)`,
  );
  console.log('--- back 160x80 ---');
  console.log(`  ${current.backHeader}`);
  console.log(`  ${current.backSub}`);
  for (const row of current.backRows) {
    const left = row.left ? `${row.left.label} ${row.left.value}` : '';
    const right = row.right ? `${row.right.label} ${row.right.value}` : '';
    console.log(`  ${left.padEnd(18)}| ${right}`);
  }
}
