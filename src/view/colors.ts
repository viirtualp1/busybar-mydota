import { BASE_COLORS } from 'busybar-kit/colors';

export const COLORS = {
  ...BASE_COLORS,
  radiant: '#3FBF5FFF',
  dire: '#E14B3AFF',
  radiantFill: '#0C2E17FF',
  direFill: '#33100BFF',
  gold: '#E0B341FF',
  danger: '#E14B3AFF',
  ledGood: '#3FBF5FFF',
  ledBad: '#E14B3AFF',
  ledNeutral: '#FFFFFFFF',
} as const;

export type SideColors = { text: string; fill: string };

export function sideColors(side: 'radiant' | 'dire' | null): SideColors {
  if (side === 'dire') {
    return { text: COLORS.dire, fill: COLORS.direFill };
  }

  return { text: COLORS.radiant, fill: COLORS.radiantFill };
}
