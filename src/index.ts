#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { App } from './app';
import { BarDisplay, createBusyBar } from './bar/display';
import { errorMessage } from 'busybar-kit/errors';
import { gsiEndpoint, loadConfig, loadEnvFile } from './config';
import { HeroCatalog } from './dota/heroes';
import { demoPayload } from './gsi/demo';
import { CFG_DIR, CFG_NAME, findDotaDir } from './gsi/install';
import { GsiServer } from './gsi/server';

loadEnvFile();
const { config, warnings } = loadConfig();

const gsi = new GsiServer({
  port: config.gsiPort,
  host: config.gsiHost,
  token: config.gsiToken,
  staleMs: config.gsiStaleMs,
});

console.log('busybar-mydota');
console.log(`GSI endpoint: ${gsiEndpoint(config)}`);
if (config.demo) {
  console.log('Source: demo (synthetic game, no Dota needed)');
}

for (const warning of warnings) {
  console.warn(warning);
}

if (!config.demo) {
  const dotaDir = findDotaDir();
  if (!dotaDir) {
    console.warn(
      'Dota 2 not found on this machine — run `npm run gsi:install` after setting DOTA_PATH',
    );
  } else if (!existsSync(join(dotaDir, CFG_DIR, CFG_NAME))) {
    console.warn(`No ${CFG_NAME} in ${dotaDir} — run \`npm run gsi:install\``);
  }
}

await gsi.start();

const bar = createBusyBar({
  addr: config.busyAddr,
  token: config.busyToken,
  httpPassword: config.busyHttpPassword,
});

const app = new App({
  config,
  gsi,
  heroes: new HeroCatalog(),
  display: new BarDisplay(bar, config.drawPriority),
});

const startedAt = Date.now();
const demoTimer = config.demo
  ? setInterval(() => gsi.accept(demoPayload(Date.now() - startedAt)), 500)
  : null;

let exiting = false;
async function shutdown(code: number) {
  if (exiting) {
    return;
  }
  exiting = true;
  if (demoTimer) {
    clearInterval(demoTimer);
  }
  await app.stop();
  await gsi.stop();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('unhandledRejection', (reason) => {
  console.warn(`Unhandled rejection: ${errorMessage(reason)}`);
});
process.on('uncaughtException', (error) => {
  console.error(`Fatal: ${errorMessage(error)}`);
  void shutdown(1);
});

await app.start();
await app.wait();
