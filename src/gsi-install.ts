#!/usr/bin/env node
import { gsiEndpoint, loadConfig, loadEnvFile } from './config';
import { buildCfg, CFG_NAME, findDotaDir, installCfg, steamRoots } from './gsi/install';

loadEnvFile();
const { config } = loadConfig();
const argv = process.argv.slice(2);

const options = {
  endpoint: gsiEndpoint(config),
  token: config.gsiToken,
  throttleSec: config.gsiThrottleSec,
  heartbeatSec: config.gsiHeartbeatSec,
};

if (argv.includes('--print')) {
  console.log(buildCfg(options));
  process.exit(0);
}

const dotaDir = findDotaDir();
if (!dotaDir) {
  console.error('Could not find the Dota 2 install.');
  console.error('Looked under these Steam roots:');
  for (const root of steamRoots()) {
    console.error(`  ${root}`);
  }
  console.error('');
  console.error('Set DOTA_PATH to the "dota 2 beta" folder and run this again, e.g.');
  console.error('  DOTA_PATH="D:/SteamLibrary/steamapps/common/dota 2 beta"');
  process.exit(1);
}

const result = installCfg(dotaDir, options);
console.log(
  result.changed ? `Wrote ${result.path}` : `Already up to date: ${result.path}`,
);
console.log('');
console.log(`Dota will post to ${options.endpoint}`);
console.log(`Token: ${options.token || '(none — set GSI_TOKEN to require one)'}`);
console.log('');
console.log('Next:');
console.log(
  '  1. Restart Dota 2 — it only reads gamestate_integration configs at launch.',
);
console.log(`  2. Run \`npm run dev\` and start a game. ${CFG_NAME} does the rest.`);
console.log('  3. Nothing arriving? Check `npm run gsi:check` while Dota is open.');
