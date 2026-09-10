import { defineConfigSpec, integerIn, matching } from 'busybar-kit/config-spec';

export default defineConfigSpec({
  name: 'mydota',
  summary: 'Your own game, live off Dota 2 Game State Integration',
  sections: [
    {
      kind: 'env',
      file: '.env',
      title: 'Settings',
      reloads: 'restart',
      fields: [
        {
          key: 'STEAM_ID',
          label: 'Steam ID',
          type: 'text',
          placeholder: '76561198000000000',
          hint: 'For the between-games screen. Dota reports it once you are in a match',
          rules: [matching('^\\d+$', 'digits only — the 17-digit SteamID64')],
        },
        {
          key: 'SOUNDS',
          label: 'Play a sound on kills and deaths',
          type: 'boolean',
          fallback: '1',
        },
        {
          key: 'TICKER_STYLE',
          label: 'How a long line moves',
          type: 'select',
          fallback: 'page',
          options: [
            { value: 'page', label: 'page', hint: 'a screenful at a time' },
            { value: 'scroll', label: 'scroll', hint: 'sliding sideways' },
          ],
        },
        {
          key: 'GSI_PORT',
          label: 'Port Dota posts to',
          type: 'number',
          fallback: '3080',
          hint: 'Changing this needs `gsi:install` run again',
          rules: [integerIn(1024, 65_535)],
        },
        {
          key: 'GSI_TOKEN',
          label: 'Shared secret with Dota',
          type: 'secret',
          advanced: true,
          hint: 'Optional. Rejects packets that do not carry it',
        },
        {
          key: 'ACCOUNT_POLL_MS',
          label: 'How often OpenDota is asked',
          type: 'number',
          advanced: true,
          rules: [integerIn(60_000, 3_600_000)],
        },
        {
          key: 'GSI_STALE_MS',
          label: 'Silence before Dota counts as gone',
          type: 'number',
          advanced: true,
          rules: [integerIn(5000, 300_000)],
        },
        {
          key: 'TICKER_CHARS',
          label: 'Characters on the ticker line',
          type: 'number',
          advanced: true,
          rules: [integerIn(8, 40)],
        },
      ],
    },
  ],
});
