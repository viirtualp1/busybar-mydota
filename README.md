# busybar-mydota

Your own live Dota 2 game on a [BUSY Bar](https://busy.app/) — your KDA, your
respawn timer, the score, the map — fed straight from the client you are playing
on. Sibling project to `busybar-dota`, which does the same for pro matches.

The difference matters: no public Valve or OpenDota endpoint reports a normal
match while it is being played. `GetLiveLeagueGames` is leagues only, OpenDota's
`/live` is leagues only, and match details land minutes after the game is over.
The only thing that knows what is happening in _your_ game, right now, is your
own Dota client — so this reads that, through **Game State Integration**.

## What you get

**Front — the whole 72×16 strip is the game at a glance**

- **Your KDA, big and centred**, in the bold font. Not the team score: the team
  score is two small digits, and it is your own line that you actually want to
  read from the sofa.
- **Dead instead**: `DEAD 25`. When you die the big line becomes the respawn
  countdown in red, and goes back to the KDA when you spawn. It is the single
  most useful number on the display and it is impossible to miss.
- **The background is the score**, split by kill share — your side's colour from
  the left, theirs from the right. Radiant green, Dire red, matching the game,
  so a losing Dire game is a mostly-green strip and you know without reading.
- Bottom row: **clock**, **score** (yours first, always), **net worth** in gold.
- **Event ticker**: on a kill, a death, a killing spree, a building, or the game
  starting and ending, the bottom row hands itself over for seven seconds —
  `Killing spree`, `Their rax fell`, `Victory` — with an LED flash (green when
  it went your way, red when it did not) and a sound, then gives the clock back.

**Back — a 160×80 stat sheet**

Two columns of label/value pairs, chosen for what fits and what you would
actually glance at:

```
JUGGERNAUT  L16
20:00  23-19  DAY
KDA  8/2/11     |  CS   124/12
GPM  480        |  XPM  560
NET  15k        |  GOLD 1.9k
HP   84%        |  MP   87%
TWR  9-7        |  RAX  6-6
```

While you are dead the `HP`/`MP` row becomes `DEAD 25` and `BUY 785` — the
buyback price, green once you can actually afford it, or the cooldown if you
cannot buy back yet.

**Between games**

When Dota is in the menu the Bar switches to your account: today's record
(counted from local midnight, not the last 24 hours), your current win or loss
streak, your rank, and the hero, KDA and length of your last game — from
OpenDota, polled only while you are _not_ in a game.

A finished game stays on the Bar for 90 seconds after you leave to the menu, so
walking away at the end of a game does not wipe the result off the display.

**When Dota is not running**

`DOTA` in grey, and a back display that tells you what to do about it:
`gsi:install`, then restart Dota. No blank screen, no silent failure.

## Requirements

- Node 22 or newer
- A BUSY Bar over USB, Wi-Fi or cloud
- Dota 2 on the same machine as this process (GSI posts to localhost)

## Setup

```bash
npm install
cp .env.example .env      # then fill in your Bar's address
npm run gsi:install
```

`gsi:install` finds your Dota 2 install — the Steam registry key, then
`libraryfolders.vdf`, then the usual drive letters — and writes
`game/dota/cfg/gamestate_integration/gamestate_integration_busybar.cfg` into it.
That file tells Dota where to post. If it cannot find Dota, set `DOTA_PATH` in
`.env` to your `dota 2 beta` folder and run it again.

**Restart Dota 2 afterwards.** It reads `gamestate_integration` configs only at
launch; a config added while the client is open does nothing until it restarts.

Then:

```bash
npm run dev
```

Start a game. The Bar picks it up from hero selection onwards.

### Check the feed without a Bar

```bash
npm run gsi:check
```

Prints one line per packet Dota sends — phase, clock, score, hero, KDA — so you
can tell "Dota is not sending" apart from "the Bar is not drawing". Add
`--dump payload.json` to write the raw JSON of the last packet, which is the
fastest way to see what your client actually reports.

### Screenshots without a Bar

```bash
npm run shot            # live, mid-game
npm run shot -- --dead
npm run shot -- --draft
npm run shot -- --result
npm run shot -- --idle
npm run shot -- --offline
npm run shot -- --event # with an event on the ticker
```

Writes `preview-front.png` and `preview-back.png` at 8× and prints an ASCII
version of the same frame. Every shot is driven by the synthetic game in
`src/gsi/demo.ts`, which emits packets in exactly the shape Dota posts, so the
previews go through the same parser, event detection and frame code as a real
game.

### A whole game without Dota

```bash
npm run demo
```

Feeds the synthetic game to the Bar: draft, thirty minutes of play at 20× speed
with kills, deaths, towers and barracks, then a win. Good for checking the Bar
end of things while Dota is closed.

## How it gets the data

Dota 2 has a built-in feature called **Game State Integration**: drop a `.cfg`
into `game/dota/cfg/gamestate_integration/` and the client POSTs a JSON snapshot
of the game to a URL you choose, several times a second. It is the same
mechanism stream overlays and coaching tools use. No API key, no rate limit, no
delay, and nothing is injected into the game — Dota does the talking.

This project listens on `http://127.0.0.1:3080/` by default and turns each
packet into a `MatchState` (`src/gsi/parse.ts`), diffs consecutive states to
find events (`src/domain/events.ts`), and renders a frame (`src/view/frame.ts`).

### What GSI does and does not tell you

While you are **playing**, the packets carry your own seat and the shared map
state:

- Your kills, deaths, assists, last hits, denies, kill streak, gold, GPM, XPM
  and net worth
- Your hero: id, level, alive, respawn timer, buyback cost and cooldown, health
  and mana percent, scepter and shard
- Your items, with cooldowns and charges
- The clock, both team scores, day or night, paused, the game state, the winner
- Buildings on both sides, as health values — which is where the tower and
  barracks counts come from

It does **not** give you the other nine players while you are playing. That is a
deliberate Valve restriction, not a gap in this code: full ten-player data only
arrives when you are spectating. So there is no per-enemy net worth panel here,
and there cannot be one.

Roshan is the same story — `roshan_state` is a spectator field. The event and
the frame handle it if your client sends it, and simply stay quiet if it does
not.

If you **spectate**, the payload changes shape (`player.team2.player0` instead
of `player`). That is detected rather than misread, and the Bar falls back to a
reduced screen: the two team scores and the clock.

### The account screen

Between games, OpenDota fills in what GSI cannot know: your rank, and the
matches you have already finished. Your 64-bit Steam id is learned from the
first GSI packet, so `STEAM_ID` in `.env` is optional — set it only if you want
the account screen to work before you have started a game.

OpenDota is polled every five minutes at most, never during a game, and once
more two minutes after a game ends, which is roughly how long it takes for a
match to show up there.

## Configuration

Everything lives in `.env`; see `.env.example` for the full annotated list.

| Variable             | Default     | What it does                                          |
| -------------------- | ----------- | ----------------------------------------------------- |
| `BUSY_ADDR`          | `10.0.4.20` | USB address, LAN IP, or `https://api.busy.app`        |
| `BUSY_HTTP_PASSWORD` | —           | Required over Wi-Fi, ignored over USB and cloud       |
| `BUSY_TOKEN`         | —           | Cloud only                                            |
| `GSI_PORT`           | `3080`      | Where Dota posts. Re-run `gsi:install` after changing |
| `GSI_TOKEN`          | —           | Shared secret; packets without it are dropped         |
| `GSI_THROTTLE_SEC`   | `0.5`       | How often Dota sends an update                        |
| `GSI_STALE_MS`       | `30000`     | Silence after which the Bar falls back to idle        |
| `STEAM_ID`           | learned     | 64-bit Steam id, for the account screen               |
| `ACCOUNT_POLL_MS`    | `300000`    | OpenDota poll interval, between games only            |
| `SOUNDS`             | `1`         | `0` mutes every event                                 |
| `TICKER_STYLE`       | `page`      | `page` or `scroll` for lines too long for 72px        |
| `DRAW_PRIORITY`      | `40`        | Loses to a running BUSY/CUSTOM session, as it should  |
| `DOTA_PATH`          | auto        | Only needed if `gsi:install` cannot find Dota         |

## Troubleshooting

**Nothing on the Bar, `DOTA` in grey.** Dota is not posting. Run
`npm run gsi:check`, then open Dota. Still nothing: confirm the `.cfg` is in
`game/dota/cfg/gamestate_integration/` (not `game/dota/cfg/`), and that you
restarted the client after installing it.

**`Waiting for BUSY Bar`.** Over Wi-Fi, `BUSY_HTTP_PASSWORD` must be the HTTP
Access password from the Bar's web UI, and `BUSY_TOKEN` must be empty. Over USB
both are ignored.

**`BUSY Bar is showing a higher-priority app`.** A BUSY or CUSTOM session owns
the display. This app waits it out rather than fighting for it; raise
`DRAW_PRIORITY` if you disagree.

**The port is taken.** Change `GSI_PORT`, then run `npm run gsi:install` again —
the port lives in the `.cfg` too, and the two have to agree.

## Notes

- The endpoint binds to loopback. `GSI_TOKEN` only matters if you move
  `GSI_HOST` off `127.0.0.1`, and then it matters a lot.
- Events are diffed from consecutive snapshots, so a fresh match id rebaselines
  rather than firing a burst of phantom kills. A death outranks a kill in the
  same tick, and barracks outrank towers.
- The back display is greyscale on the device; the tone colours become shades,
  which is why the layout leans on labels rather than colour alone.
- Level-ups and low-health warnings are silent by design. Kills chirp, deaths
  and sprees chime — one sound per real event, and nothing that fires twice.

## Things worth building next

- **Items on the back display.** They are already parsed, with cooldowns and
  charges; five 4px columns would fit under the stat rows.
- **Rune and stack timers** off the clock, which needs nothing new from GSI.
- **Session tracking of its own**, counting the games it actually watched, so
  the idle screen works without OpenDota at all.
- **A spectator mode worth the name.** The full ten-player payload is there when
  you spectate; the current fallback screen only reads the scoreboard.
