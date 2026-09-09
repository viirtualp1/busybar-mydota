import { BACK as DEVICE_BACK, FRONT as DEVICE_FRONT } from 'busybar-kit/device';
import { fillWidth } from 'busybar-kit/elements';

export { clipToWidth, FONT_WIDTH, rowY, type BarFont } from 'busybar-kit/device';
export { MIN_FILL } from 'busybar-kit/elements';

export const FRONT = {
  ...DEVICE_FRONT,
  topY: 0,
  bottomY: 11,
  clockWidth: 24,
  scoreWidth: 24,
  worthWidth: 20,
  // The dead screen swaps the three-slot bottom row for these two.
  buybackWidth: 44,
  goldWidth: 24,
} as const;

export const BACK = {
  ...DEVICE_BACK,
  labelWidth: 30,
  valueOffset: 32,
  valueWidth: 44,
} as const;

/**
 * How much of the 72px strip my side owns. Score share rather than a raw diff,
 * so an early 1-0 does not swing the whole bar.
 */
export function myFillWidth(mine: number, theirs: number, width = FRONT.width) {
  const total = mine + theirs;

  return fillWidth(total > 0 ? mine / total : 0.5, width);
}
