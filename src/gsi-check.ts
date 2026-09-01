#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { gsiEndpoint, loadConfig, loadEnvFile } from './config';
import { HeroCatalog } from './dota/heroes';
import { demoPayload } from './gsi/demo';
import { GsiServer } from './gsi/server';
import { inMatch, type MatchState } from './domain/state';
import { formatClock, formatKda } from 'busybar-kit/format';
import { prettyHeroKey } from './view/frame';

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);
const dumpTo = dumpTarget(argv);

const heroes = new HeroCatalog();
await heroes.load();

const gsi = new GsiServer({
  port: config.gsiPort,
  host: config.gsiHost,
  token: config.gsiToken,
  staleMs: config.gsiStaleMs,
  onState: (state) => console.log(describe(state, heroes)),
  ...(dumpTo
    ? {
        onRaw: (payload) => {
          writeFileSync(dumpTo, JSON.stringify(payload, null, 2), 'utf8');
        },
      }
    : {}),
});

await gsi.start();
console.log(`Listening on ${gsiEndpoint(config)}`);
console.log(config.gsiToken ? 'Token required.' : 'No token required.');
if (dumpTo) {
  console.log(`Writing each raw payload to ${dumpTo}`);
}
console.log('Open Dota 2 and start a game. Ctrl+C to stop.');
console.log('');

if (config.demo) {
  const startedAt = Date.now();
  setInterval(() => gsi.accept(demoPayload(Date.now() - startedAt)), 500);
}

process.on('SIGINT', () => {
  void gsi.stop().then(() => process.exit(0));
});

function dumpTarget(args: readonly string[]) {
  const index = args.indexOf('--dump');
  if (index === -1) {
    return '';
  }

  return args[index + 1] ?? 'gsi-payload.json';
}

function describe(state: MatchState, catalog: HeroCatalog) {
  const stamp = new Date().toLocaleTimeString();
  if (!inMatch(state)) {
    return `${stamp}  ${state.phase}${state.spectating ? ' (spectating)' : ''}`;
  }

  const hero =
    state.hero && state.hero.id > 0
      ? catalog.name(state.hero.id)
      : prettyHeroKey(state.hero?.key ?? '');
  const parts = [
    stamp,
    state.phase.padEnd(8),
    formatClock(state.clockSec).padStart(6),
    `${state.radiantScore}-${state.direScore}`.padStart(6),
    (state.side ?? '?').padEnd(7),
    hero || '-',
  ];

  if (state.player) {
    parts.push(
      formatKda(state.player.kills, state.player.deaths, state.player.assists),
      `${state.player.gpm}gpm`,
    );
  }

  if (state.hero && !state.hero.alive) {
    parts.push(`dead ${state.hero.respawnSec}s`);
  }

  return parts.join('  ');
}
