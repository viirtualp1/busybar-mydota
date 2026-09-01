import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const CFG_NAME = 'gamestate_integration_busybar.cfg';
export const CFG_DIR = join('game', 'dota', 'cfg', 'gamestate_integration');
export const DOTA_FOLDER = join('steamapps', 'common', 'dota 2 beta');

export type CfgOptions = {
  endpoint: string;
  token: string;
  throttleSec: number;
  heartbeatSec: number;
};

export function buildCfg(options: CfgOptions) {
  const auth = options.token
    ? [
        '    "auth"',
        '    {',
        `        "token"         "${escapeVdf(options.token)}"`,
        '    }',
      ]
    : [];

  return [
    '"busybar-mydota"',
    '{',
    `    "uri"               "${escapeVdf(options.endpoint)}"`,
    '    "timeout"           "5.0"',
    '    "buffer"            "0.1"',
    `    "throttle"          "${options.throttleSec.toFixed(1)}"`,
    `    "heartbeat"         "${options.heartbeatSec.toFixed(1)}"`,
    ...auth,
    '    "data"',
    '    {',
    '        "provider"      "1"',
    '        "map"           "1"',
    '        "player"        "1"',
    '        "hero"          "1"',
    '        "abilities"     "1"',
    '        "items"         "1"',
    '        "buildings"     "1"',
    '        "draft"         "1"',
    '        "wearables"     "0"',
    '    }',
    '}',
    '',
  ].join('\n');
}

/** VDF has no escape sequences worth trusting, so quotes simply go away. */
function escapeVdf(value: string) {
  return value.replace(/"/g, '');
}

/** Every Steam library root worth searching, most likely first. */
export function steamRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = new Set<string>();
  const add = (path: string | undefined) => {
    if (path && existsSync(path)) {
      roots.add(resolve(path));
    }
  };

  add(env.STEAM_PATH);
  if (process.platform === 'win32') {
    add(registrySteamPath());
    add(join(env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Steam'));
    add(join(env.ProgramFiles ?? 'C:/Program Files', 'Steam'));
    for (const drive of ['C', 'D', 'E', 'F']) {
      add(`${drive}:/Steam`);
      add(`${drive}:/SteamLibrary`);
      add(`${drive}:/Games/Steam`);
    }
  } else if (process.platform === 'darwin') {
    add(join(homedir(), 'Library', 'Application Support', 'Steam'));
  } else {
    add(join(homedir(), '.steam', 'steam'));
    add(join(homedir(), '.local', 'share', 'Steam'));
    add(
      join(
        homedir(),
        '.var',
        'app',
        'com.valvesoftware.Steam',
        '.local',
        'share',
        'Steam',
      ),
    );
  }

  for (const root of [...roots]) {
    for (const library of libraryFolders(root)) {
      if (existsSync(library)) {
        roots.add(resolve(library));
      }
    }
  }

  return dedupe([...roots]);
}

/** Windows hands back the same folder in whatever case the source used. */
function dedupe(paths: readonly string[]) {
  if (process.platform !== 'win32') {
    return [...paths];
  }
  const seen = new Set<string>();

  return paths.filter((path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);

    return true;
  });
}

function registrySteamPath() {
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(output);

    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/** Pull the extra library roots out of libraryfolders.vdf without a vdf parser. */
export function libraryFolders(steamRoot: string): string[] {
  for (const steamapps of ['steamapps', 'SteamApps']) {
    const path = join(steamRoot, steamapps, 'libraryfolders.vdf');
    if (!existsSync(path)) {
      continue;
    }
    try {
      return parseLibraryFolders(readFileSync(path, 'utf8'));
    } catch {
      return [];
    }
  }

  return [];
}

export function parseLibraryFolders(vdf: string): string[] {
  const paths: string[] = [];
  for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
    const value = match[1];
    if (value) {
      // Steam writes Windows paths with doubled separators.
      paths.push(value.replaceAll('\\\\', '\\'));
    }
  }

  return paths;
}

export function findDotaDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.DOTA_PATH?.trim();
  if (override) {
    return existsSync(join(override, 'game')) ? resolve(override) : null;
  }

  for (const root of steamRoots(env)) {
    for (const folder of [DOTA_FOLDER, DOTA_FOLDER.replace('steamapps', 'SteamApps')]) {
      const candidate = join(root, folder);
      if (existsSync(join(candidate, 'game'))) {
        return candidate;
      }
    }
    // A library root can already be the steamapps folder itself.
    const direct = join(root, 'common', 'dota 2 beta');
    if (existsSync(join(direct, 'game'))) {
      return direct;
    }
  }

  return null;
}

export type InstallResult = {
  path: string;
  changed: boolean;
};

export function installCfg(dotaDir: string, options: CfgOptions): InstallResult {
  const directory = join(dotaDir, CFG_DIR);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, CFG_NAME);
  const next = buildCfg(options);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (current === next) {
    return { path, changed: false };
  }
  writeFileSync(path, next, 'utf8');

  return { path, changed: true };
}
