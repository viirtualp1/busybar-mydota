import { type BarConfig, loadBarConfig } from 'busybar-kit/config';
import type { TickerStyle } from 'busybar-kit/ticker';

export { loadEnvFile } from 'busybar-kit/config';

export type Config = BarConfig & {
  gsiHost: string;
  gsiPort: number;
  gsiToken: string;
  gsiStaleMs: number;
  gsiThrottleSec: number;
  gsiHeartbeatSec: number;
  steamId: string;
  accountPollMs: number;
  demo: boolean;
  sounds: boolean;
  tickerStyle: TickerStyle;
  tickerChars: number;
};

export type LoadedConfig = {
  config: Config;
  warnings: string[];
};

export const DEFAULTS = {
  gsiHost: '127.0.0.1',
  gsiPort: 3080,
  gsiStaleMs: 30_000,
  gsiThrottleSec: 0.5,
  gsiHeartbeatSec: 10,
  accountPollMs: 300_000,
  tickerChars: 17,
} as const;

const LIMITS = {
  gsiPort: { min: 1024, max: 65_535 },
  gsiStaleMs: { min: 5000, max: 300_000 },
  accountPollMs: { min: 60_000, max: 3_600_000 },
  tickerChars: { min: 8, max: 40 },
} as const;

const FLOAT_LIMITS = {
  gsiThrottleSec: { min: 0.1, max: 5 },
  gsiHeartbeatSec: { min: 1, max: 60 },
} as const;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
): LoadedConfig {
  const warnings: string[] = [];
  const { bar, env: reader } = loadBarConfig(env, warnings);
  const { read, number } = reader;

  const steamId = read('STEAM_ID');
  if (steamId && !/^\d+$/.test(steamId)) {
    warnings.push(`STEAM_ID=${steamId} is not a number — account stats are disabled`);
  }

  return {
    warnings,
    config: {
      ...bar,
      gsiHost: read('GSI_HOST') || DEFAULTS.gsiHost,
      gsiPort: number('GSI_PORT', DEFAULTS.gsiPort, LIMITS.gsiPort),
      gsiToken: read('GSI_TOKEN'),
      gsiStaleMs: number('GSI_STALE_MS', DEFAULTS.gsiStaleMs, LIMITS.gsiStaleMs),
      gsiThrottleSec: number(
        'GSI_THROTTLE_SEC',
        DEFAULTS.gsiThrottleSec,
        FLOAT_LIMITS.gsiThrottleSec,
        false,
      ),
      gsiHeartbeatSec: number(
        'GSI_HEARTBEAT_SEC',
        DEFAULTS.gsiHeartbeatSec,
        FLOAT_LIMITS.gsiHeartbeatSec,
        false,
      ),
      steamId: /^\d+$/.test(steamId) ? steamId : '',
      accountPollMs: number(
        'ACCOUNT_POLL_MS',
        DEFAULTS.accountPollMs,
        LIMITS.accountPollMs,
      ),
      demo: argv.includes('--demo') || read('DEMO') === '1',
      sounds: read('SOUNDS') !== '0',
      tickerStyle: read('TICKER_STYLE').toLowerCase() === 'scroll' ? 'scroll' : 'page',
      tickerChars: number('TICKER_CHARS', DEFAULTS.tickerChars, LIMITS.tickerChars),
    },
  };
}

export function gsiEndpoint(config: Pick<Config, 'gsiHost' | 'gsiPort'>) {
  return `http://${config.gsiHost}:${config.gsiPort}/`;
}
