import type { TextElement } from '@busy-app/busy-lib';
import { band, type AnyElement } from 'busybar-kit/elements';
import { COLORS } from '../view/colors';
import type { BackCell, BuybackTone, CellTone, MyFrame } from '../view/frame';
import { BACK, clipToWidth, FRONT, rowY } from './layout';

export type { AnyElement };

const TONE_COLORS: Record<CellTone, string> = {
  normal: COLORS.backText,
  good: COLORS.radiant,
  bad: COLORS.dire,
  gold: COLORS.gold,
};

const BUYBACK_COLORS: Record<BuybackTone, string> = {
  ready: COLORS.radiant,
  short: COLORS.dire,
  cooldown: COLORS.muted,
};

const MID_X = Math.floor(FRONT.width / 2);
const MID_Y = Math.floor(FRONT.height / 2);

export function frontElements(frame: MyFrame): AnyElement[] {
  const fill = frame.myFill;
  // A solo screen owns the whole strip; nothing else competes for the row.
  const solo = frame.bigOnly;
  const ticking = !solo && frame.tickerText.length > 0;

  return [
    band('band-mine', 0, fill, frame.showBands ? frame.myFillColor : COLORS.transparent),
    band(
      'band-theirs',
      fill,
      FRONT.width - fill,
      frame.showBands ? frame.theirFillColor : COLORS.transparent,
    ),
    {
      id: 'big',
      type: 'text',
      text: frame.bigText || ' ',
      font: frame.bigFont,
      color: frame.bigText ? frame.bigColor : COLORS.transparent,
      display: 'front',
      align: solo ? 'center' : 'top_mid',
      x: MID_X,
      y: solo ? MID_Y : FRONT.topY,
      timeout: 0,
    },
    bottomText(
      'clock',
      solo ? '' : frame.clockText,
      ticking,
      COLORS.clock,
      'top_left',
      1,
      FRONT.clockWidth,
    ),
    bottomText(
      'score',
      solo ? '' : frame.scoreText,
      ticking,
      COLORS.white,
      'top_mid',
      MID_X,
      FRONT.scoreWidth,
    ),
    bottomText(
      'worth',
      solo ? '' : frame.worthText,
      ticking,
      COLORS.gold,
      'top_right',
      FRONT.width - 1,
      FRONT.worthWidth,
    ),
    // The dead screen's own bottom row. It shares the slot with the clock row
    // above, and only one of the two is ever filled in.
    bottomText(
      'buyback',
      solo ? '' : frame.buybackText,
      ticking,
      BUYBACK_COLORS[frame.buybackTone],
      'top_left',
      1,
      FRONT.buybackWidth,
    ),
    bottomText(
      'gold',
      solo ? '' : frame.goldText,
      ticking,
      COLORS.gold,
      'top_right',
      FRONT.width - 1,
      FRONT.goldWidth,
    ),
    {
      id: 'ticker',
      type: 'text',
      text: ticking ? clipToWidth(frame.tickerText, FRONT.width - 2, 'tiny') : ' ',
      font: 'tiny',
      color: ticking ? COLORS.ticker : COLORS.transparent,
      display: 'front',
      align: 'top_mid',
      x: MID_X,
      y: FRONT.bottomY,
      timeout: 0,
    },
  ];
}

/**
 * `width` is deliberately not set on these. In the Bar's API it declares a
 * fixed-width *label* (the box the scroll_* fields animate), and the anchor
 * applies to that box while the text sits at its left edge — so a `top_mid`
 * label lands left of centre and a `top_right` one stops short of the edge.
 * Without it the anchor applies to the text itself; `clipToWidth` still keeps
 * each field inside its own slot.
 */
function bottomText(
  id: string,
  text: string,
  ticking: boolean,
  color: string,
  align: 'top_left' | 'top_mid' | 'top_right',
  x: number,
  width: number,
): TextElement {
  const visible = !ticking && text.length > 0;

  return {
    id,
    type: 'text',
    text: visible ? clipToWidth(text, width, 'tiny') : ' ',
    font: 'tiny',
    color: visible ? color : COLORS.transparent,
    display: 'front',
    align,
    x,
    y: FRONT.bottomY,
    timeout: 0,
  };
}

export function backElements(frame: MyFrame): AnyElement[] {
  const elements: AnyElement[] = [
    {
      id: 'back-header',
      type: 'text',
      text: clipToWidth(frame.backHeader || ' ', BACK.width - 4, 'small'),
      font: 'small',
      color: frame.backHeader ? COLORS.white : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x: BACK.leftX,
      y: BACK.headerY,
      timeout: 0,
    },
    {
      id: 'back-sub',
      type: 'text',
      text: clipToWidth(frame.backSub || ' ', BACK.width - 4, 'tiny'),
      font: 'tiny',
      color: frame.backSub ? COLORS.muted : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x: BACK.leftX,
      y: BACK.subHeaderY,
      timeout: 0,
    },
    {
      id: 'column-divider',
      type: 'rectangle',
      display: 'back',
      align: 'top_left',
      x: BACK.rightX - 4,
      y: BACK.firstRowY - 3,
      width: 1,
      height: BACK.height - BACK.firstRowY + 2,
      fill: 'solid',
      fill_colors: [frame.showDivider ? COLORS.backDivider : COLORS.transparent],
      border_width: 0,
      border_color: COLORS.transparent,
      timeout: 0,
    },
  ];

  for (let index = 0; index < BACK.maxRows; index += 1) {
    const row = frame.backRows[index];
    const y = rowY(index);
    elements.push(
      ...cellElements(`l${index}`, BACK.leftX, y, row?.left ?? null),
      ...cellElements(`r${index}`, BACK.rightX, y, row?.right ?? null),
    );
  }

  return elements;
}

function cellElements(id: string, x: number, y: number, cell: BackCell | null) {
  const elements: TextElement[] = [
    {
      id: `${id}-label`,
      type: 'text',
      text: cell ? clipToWidth(cell.label, BACK.labelWidth, 'tiny') : ' ',
      font: 'tiny',
      color: cell ? COLORS.dim : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x,
      y,
      width: BACK.labelWidth,
      timeout: 0,
    },
    {
      id: `${id}-value`,
      type: 'text',
      text: cell ? clipToWidth(cell.value, BACK.valueWidth, 'tiny') : ' ',
      font: 'tiny',
      color: cell ? TONE_COLORS[cell.tone] : COLORS.transparent,
      display: 'back',
      align: 'top_left',
      x: x + BACK.valueOffset,
      y,
      width: BACK.valueWidth,
      timeout: 0,
    },
  ];

  return elements;
}
