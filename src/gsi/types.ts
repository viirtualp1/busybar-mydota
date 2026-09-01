// Shapes Dota 2 posts to the Game State Integration endpoint. Everything is
// optional: which blocks arrive depends on the .cfg, on whether you are playing
// or spectating, and on the game state. Nothing here is trusted without a check.

export type GsiProvider = {
  name?: string;
  appid?: number;
  version?: number;
  timestamp?: number;
};

export type GsiMap = {
  name?: string;
  matchid?: string;
  game_time?: number;
  clock_time?: number;
  daytime?: boolean;
  nightstalker_night?: boolean;
  game_state?: string;
  paused?: boolean;
  win_team?: string;
  customgamename?: string;
  radiant_score?: number;
  dire_score?: number;
  radiant_ward_purchase_cooldown?: number;
  dire_ward_purchase_cooldown?: number;
  roshan_state?: string;
  roshan_state_end_seconds?: number;
};

export type GsiPlayer = {
  steamid?: string;
  accountid?: string;
  name?: string;
  activity?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  last_hits?: number;
  denies?: number;
  kill_streak?: number;
  commands_issued?: number;
  kill_list?: Record<string, number>;
  team_name?: string;
  player_slot?: number;
  gold?: number;
  gold_reliable?: number;
  gold_unreliable?: number;
  gpm?: number;
  xpm?: number;
  net_worth?: number;
};

export type GsiHero = {
  xpos?: number;
  ypos?: number;
  id?: number;
  name?: string;
  level?: number;
  xp?: number;
  alive?: boolean;
  respawn_seconds?: number;
  buyback_cost?: number;
  buyback_cooldown?: number;
  health?: number;
  max_health?: number;
  health_percent?: number;
  mana?: number;
  max_mana?: number;
  mana_percent?: number;
  silenced?: boolean;
  stunned?: boolean;
  disarmed?: boolean;
  magicimmune?: boolean;
  hexed?: boolean;
  muted?: boolean;
  break?: boolean;
  aghanims_scepter?: boolean;
  aghanims_shard?: boolean;
  smoked?: boolean;
  has_debuff?: boolean;
};

export type GsiItem = {
  name?: string;
  purchaser?: number;
  item_level?: number;
  contains_rune?: string;
  can_cast?: boolean;
  cooldown?: number;
  passive?: boolean;
  charges?: number;
};

export type GsiItems = Record<string, GsiItem | undefined>;

export type GsiBuilding = { health?: number; max_health?: number };

export type GsiBuildings = {
  radiant?: Record<string, GsiBuilding | undefined>;
  dire?: Record<string, GsiBuilding | undefined>;
};

export type GsiDraft = {
  activeteam?: number;
  pick?: boolean;
  activeteam_time?: number;
  team2?: Record<string, unknown>;
  team3?: Record<string, unknown>;
};

export type GsiPayload = {
  provider?: GsiProvider;
  map?: GsiMap;
  // While spectating these become { team2: { player0: {...} } } instead.
  player?: GsiPlayer | Record<string, Record<string, GsiPlayer>>;
  hero?: GsiHero | Record<string, Record<string, GsiHero>>;
  items?: GsiItems | Record<string, Record<string, GsiItems>>;
  buildings?: GsiBuildings;
  draft?: GsiDraft;
  auth?: { token?: string };
  previously?: unknown;
  added?: unknown;
};
