import type { TextElement } from '@busy-app/busy-lib';
import { band, type AnyElement } from 'busybar-kit/elements';
import { COLORS } from '../view/colors';
import type { BackCell, CellTone, MyFrame } from '../view/frame';
import { BACK, clipToWidth, FRONT, rowY } from './layout';

export type { AnyElement };

const TONE_COLORS: Record<CellTone, string> = {
  normal: COLORS.backText,
  good: COLORS.radiant,
  bad: COLORS.dire,
  gold: COLORS.gold,
};

export function frontElements(frame: MyFrame): AnyElement[] {
  const fill = frame.myFill;
  const ticking = frame.tickerText.length > 0;

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
      font: 'bold',
      color: frame.bigText ? frame.bigColor : COLORS.transparent,
      display: 'front',
      align: 'top_mid',
      x: Math.floor(FRONT.width / 2),
      y: FRONT.topY,
      timeout: 0,
    },
    bottomText(
      'clock',
      frame.clockText,
      ticking,
      COLORS.clock,
      'top_left',
      1,
      FRONT.clockWidth,
    ),
    bottomText(
      'score',
      frame.scoreText,
      ticking,
      COLORS.white,
      'top_mid',
      Math.floor(FRONT.width / 2),
      FRONT.scoreWidth,
    ),
    bottomText(
      'worth',
      frame.worthText,
      ticking,
      COLORS.gold,
      'top_right',
      FRONT.width - 1,
      FRONT.worthWidth,
    ),
    {
      id: 'ticker',
      type: 'text',
      text: ticking ? clipToWidth(frame.tickerText, FRONT.width - 2, 'tiny') : ' ',
      font: 'tiny',
      color: ticking ? COLORS.ticker : COLORS.transparent,
      display: 'front',
      align: 'top_mid',
      x: Math.floor(FRONT.width / 2),
      y: FRONT.bottomY,
      timeout: 0,
    },
  ];
}

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
    width,
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
