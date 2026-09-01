const BASE_URL = 'https://api.opendota.com/api';

/** Steam's 64-bit ids are the 32-bit account id plus this constant. */
export const STEAM_ID64_BASE = 76_561_197_960_265_728n;

export function toAccountId(steamId: string): number | null {
  const trimmed = steamId.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = BigInt(trimmed);
  const accountId = value > STEAM_ID64_BASE ? value - STEAM_ID64_BASE : value;
  if (accountId <= 0n || accountId > 0xffff_ffffn) {
    return null;
  }

  return Number(accountId);
}

export type RecentMatch = {
  matchId: string;
  heroId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  startedAtMs: number;
};

export type AccountStats = {
  accountId: number;
  personaName: string;
  rank: string;
  today: { wins: number; losses: number };
  streak: { kind: 'W' | 'L'; length: number } | null;
  last: RecentMatch | null;
  fetchedAtMs: number;
};

const MEDALS = [
  'Herald',
  'Guardian',
  'Crusader',
  'Archon',
  'Legend',
  'Ancient',
  'Divine',
] as const;

export function formatRank(rankTier: unknown, leaderboardRank: unknown) {
  const tier = Number(rankTier);
  if (!Number.isFinite(tier) || tier <= 0) {
    return '';
  }
  const medal = Math.floor(tier / 10);
  const star = tier % 10;
  if (medal >= 8) {
    const place = Number(leaderboardRank);

    return Number.isFinite(place) && place > 0 ? `Immortal #${place}` : 'Immortal';
  }
  const name = MEDALS[medal - 1];
  if (!name) {
    return '';
  }

  return star > 0 ? `${name} ${star}` : name;
}

/** Matches that started after the last local midnight. */
export function todayRecord(matches: readonly RecentMatch[], nowMs: number) {
  const midnight = new Date(nowMs);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.getTime();
  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    if (match.startedAtMs < since) {
      continue;
    }
    if (match.win) {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return { wins, losses };
}

/** How many games the most recent result has run for. Matches come newest first. */
export function currentStreak(matches: readonly RecentMatch[]) {
  const first = matches[0];
  if (!first) {
    return null;
  }
  let length = 0;
  for (const match of matches) {
    if (match.win !== first.win) {
      break;
    }
    length += 1;
  }

  return { kind: first.win ? ('W' as const) : ('L' as const), length };
}

type OpenDotaMatch = {
  match_id?: unknown;
  hero_id?: unknown;
  player_slot?: unknown;
  radiant_win?: unknown;
  kills?: unknown;
  deaths?: unknown;
  assists?: unknown;
  duration?: unknown;
  start_time?: unknown;
};

export function parseRecentMatches(body: unknown): RecentMatch[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const matches: RecentMatch[] = [];

  for (const entry of body as OpenDotaMatch[]) {
    const slot = Number(entry.player_slot);
    const radiantWin = entry.radiant_win;
    if (!Number.isFinite(slot) || typeof radiantWin !== 'boolean') {
      continue;
    }
    const onRadiant = slot < 128;
    const startedAt = Number(entry.start_time);
    const duration = Number(entry.duration);

    matches.push({
      matchId: typeof entry.match_id === 'number' ? String(entry.match_id) : '',
      heroId: number(entry.hero_id),
      win: onRadiant === radiantWin,
      kills: number(entry.kills),
      deaths: number(entry.deaths),
      assists: number(entry.assists),
      durationSec: Number.isFinite(duration) ? Math.trunc(duration) : 0,
      startedAtMs: Number.isFinite(startedAt) ? startedAt * 1000 : 0,
    });
  }

  return matches;
}

function number(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export type AccountOptions = {
  accountId: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export class AccountSource {
  readonly label = 'OpenDota account stats';

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AccountOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async poll(nowMs = Date.now()): Promise<AccountStats> {
    const [profile, recent] = await Promise.all([
      this.get(`/players/${this.options.accountId}`),
      this.get(`/players/${this.options.accountId}/recentMatches`),
    ]);

    const matches = parseRecentMatches(recent);
    const profileRecord =
      profile && typeof profile === 'object' ? (profile as Record<string, unknown>) : {};
    const persona =
      profileRecord.profile && typeof profileRecord.profile === 'object'
        ? (profileRecord.profile as Record<string, unknown>).personaname
        : '';

    return {
      accountId: this.options.accountId,
      personaName: typeof persona === 'string' ? persona : '',
      rank: formatRank(profileRecord.rank_tier, profileRecord.leaderboard_rank),
      today: todayRecord(matches, nowMs),
      streak: currentStreak(matches),
      last: matches[0] ?? null,
      fetchedAtMs: nowMs,
    };
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenDota ${path} responded ${response.status}`);
    }

    return response.json();
  }
}
