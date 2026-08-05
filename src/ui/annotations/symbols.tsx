/**
 * Electrical symbol definitions and SVG rendering for annotation overlays.
 *
 * Each symbol is drawn in a coordinate space centered at (0,0) and
 * translated to the placed (x,y) position via a <G transform> in the
 * caller's SVG canvas.
 */
import React from 'react';
import { G, Circle, Rect, Line, Path, Text as SvgText } from 'react-native-svg';
import type { SymbolType, SymbolFamily, PlacedSymbol } from '@/src/media/annotation-service';

export const SYMBOL_FAMILIES: SymbolFamily[] = [
  'socket',
  'switch',
  'ceiling_rose',
  'downlight',
  'consumer_unit',
  'junction_box',
  'smoke_detector',
  'fan',
];

/** Every placeable variant, grouped by family — first entry is that family's default. */
export const SYMBOL_VARIANTS: Record<SymbolFamily, SymbolType[]> = {
  socket: ['socket', 'socket_double', 'socket_double_usb', 'socket_floor', 'socket_outdoor'],
  switch: ['switch', 'switch_2way', 'switch_dimmer', 'switch_pull_cord'],
  ceiling_rose: ['ceiling_rose'],
  downlight: ['downlight', 'downlight_dimmable'],
  consumer_unit: ['consumer_unit', 'consumer_unit_sub'],
  junction_box: ['junction_box'],
  smoke_detector: ['smoke_detector', 'heat_detector', 'co_detector'],
  fan: ['fan', 'fan_humidistat'],
};

export const SYMBOL_FAMILY_OF: Record<SymbolType, SymbolFamily> = Object.fromEntries(
  SYMBOL_FAMILIES.flatMap((family) => SYMBOL_VARIANTS[family].map((type) => [type, family])),
) as Record<SymbolType, SymbolFamily>;

export const SYMBOL_LABELS: Record<SymbolType, string> = {
  socket: 'Socket',
  socket_double: 'Double socket',
  socket_double_usb: 'Double socket + USB',
  socket_floor: 'Floor socket',
  socket_outdoor: 'Outdoor socket',
  switch: 'Switch',
  switch_2way: '2-way switch',
  switch_dimmer: 'Dimmer switch',
  switch_pull_cord: 'Pull-cord switch',
  ceiling_rose: 'Ceiling rose',
  downlight: 'Downlight',
  downlight_dimmable: 'Dimmable downlight',
  consumer_unit: 'Con. unit',
  consumer_unit_sub: 'Sub consumer unit',
  junction_box: 'J-box',
  smoke_detector: 'Smoke det.',
  heat_detector: 'Heat det.',
  co_detector: 'CO det.',
  fan: 'Fan',
  fan_humidistat: 'Humidistat fan',
};

/** One fixed colour per symbol family — variants within a family share it; no per-placement colour choice. */
const SYMBOL_FAMILY_COLORS: Record<SymbolFamily, string> = {
  socket: '#FFFFFF',
  switch: '#1B8FFF',
  ceiling_rose: '#F0B730',
  downlight: '#FFD166',
  consumer_unit: '#FF3B30',
  junction_box: '#9B5DE5',
  smoke_detector: '#FF7043',
  fan: '#06D6A0',
};

export const SYMBOL_TYPE_COLORS: Record<SymbolType, string> = Object.fromEntries(
  (Object.keys(SYMBOL_FAMILY_OF) as SymbolType[]).map((type) => [type, SYMBOL_FAMILY_COLORS[SYMBOL_FAMILY_OF[type]]]),
) as Record<SymbolType, string>;

// All symbols drawn centered at origin in a ~40×40 dp coordinate space.
//
// Matched to the graphical symbols commonly used on UK/Ireland M&E
// (mechanical & electrical) installation layout drawings — the pictograms
// an electrician would recognise on a real floor plan (circuit/schematic
// diagrams have their own separate, formally standardised symbol set under
// BS EN 60617/IEC 60617, which this is NOT — there is no single mandated
// icon set for floor-plan annotation, so this follows widely-used common
// practice rather than a specific numbered clause).
function SymbolElements({ type, color }: { type: SymbolType; color: string }) {
  const s = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  // Variants within a family share the family's pictogram for now (e.g. every
  // socket variant draws the same outlet glyph) — the label carries the
  // specific variant; a distinct glyph per variant can follow later if needed.
  switch (SYMBOL_FAMILY_OF[type]) {
    case 'socket':
      // Outlet circle with two prong marks — twin-socket silhouette
      return (
        <G>
          <Circle cx={0} cy={0} r={13} {...s} />
          <Line x1={13} y1={-6} x2={22} y2={-14} {...s} />
          <Line x1={13} y1={6} x2={22} y2={14} {...s} />
        </G>
      );

    case 'switch':
      // Single flag off a circle — one-way switch drop point
      return (
        <G>
          <Circle cx={0} cy={0} r={11} {...s} />
          <Line x1={11} y1={0} x2={22} y2={0} {...s} />
        </G>
      );

    case 'ceiling_rose':
      // Ceiling light point — circle with crossed diagonals
      return (
        <G>
          <Circle cx={0} cy={0} r={15} {...s} />
          <Line x1={-10.5} y1={-10.5} x2={10.5} y2={10.5} {...s} />
          <Line x1={-10.5} y1={10.5} x2={10.5} y2={-10.5} {...s} />
        </G>
      );

    case 'downlight':
      // Recessed fitting — solid inner disc inside an outline
      return (
        <G>
          <Circle cx={0} cy={0} r={15} {...s} />
          <Circle cx={0} cy={0} r={6} fill={color} stroke="none" />
        </G>
      );

    case 'consumer_unit':
      // Distribution board — enclosure with a single divider
      return (
        <G>
          <Rect x={-16} y={-14} width={32} height={28} rx={2} {...s} />
          <Line x1={-16} y1={-4} x2={16} y2={-4} {...s} />
        </G>
      );

    case 'junction_box':
      // Junction box — square (distinct shape from the circular points)
      return (
        <G>
          <Rect x={-12} y={-12} width={24} height={24} {...s} />
          <Line x1={-12} y1={-12} x2={12} y2={12} {...s} />
          <Line x1={-12} y1={12} x2={12} y2={-12} {...s} />
        </G>
      );

    case 'smoke_detector':
      // Detector head — circle-in-circle with vent ticks
      return (
        <G>
          <Circle cx={0} cy={0} r={15} {...s} />
          <Circle cx={0} cy={0} r={6} {...s} />
          <Line x1={0} y1={-6} x2={0} y2={-11} {...s} />
          <Line x1={0} y1={6} x2={0} y2={11} {...s} />
          <Line x1={-6} y1={0} x2={-11} y2={0} {...s} />
          <Line x1={6} y1={0} x2={11} y2={0} {...s} />
        </G>
      );

    case 'fan':
      // Extract fan — 3-blade pinwheel in a circle
      return (
        <G>
          <Circle cx={0} cy={0} r={15} {...s} />
          <Path d="M0,0 L0,-13 A13,13 0 0,1 11.3,6.5 Z" fill={color} stroke="none" />
          <Path d="M0,0 L11.3,6.5 A13,13 0 0,1 -11.3,6.5 Z" {...s} />
          <Path d="M0,0 L-11.3,6.5 A13,13 0 0,1 0,-13 Z" {...s} />
          <Circle cx={0} cy={0} r={3} fill={color} stroke="none" />
        </G>
      );

    default:
      return null;
  }
}

// Label pill drawn below the glyph, sized in the same local (pre-scale)
// coordinate space as SymbolElements' fixed glyph shapes — the outer G's
// scale (below) enlarges it in proportion, same as the glyph itself.
const LABEL_FONT_SIZE = 9;
const LABEL_CHAR_WIDTH = LABEL_FONT_SIZE * 0.58;
const LABEL_PAD_X = 5;
const LABEL_HEIGHT = LABEL_FONT_SIZE * 1.7;
const LABEL_OFFSET_Y = 24;

function SymbolLabel({ text }: { text: string }) {
  const width = text.length * LABEL_CHAR_WIDTH + LABEL_PAD_X * 2;
  return (
    <G transform={`translate(0, ${LABEL_OFFSET_Y})`}>
      <Rect x={-width / 2} y={-LABEL_HEIGHT / 2} width={width} height={LABEL_HEIGHT} rx={LABEL_HEIGHT / 2} fill="rgba(0,0,0,0.72)" />
      <SvgText x={0} y={LABEL_FONT_SIZE * 0.35} fontSize={LABEL_FONT_SIZE} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

// Drop this inside any <Svg> to render a placed symbol at its stored (x, y).
// scale defaults to 1 (matches in-app on-screen rendering); pass a larger
// value when rendering onto a higher-resolution canvas (e.g. a flattened
// share export) so the glyph stays the same size RELATIVE to the image,
// rather than shrinking to a fixed absolute pixel size.
//
// showLabel is opt-in (not every caller wants it — e.g. the wall screen's
// small 40x40 drag-handle preview would clip a label rendered below the
// glyph) — enabled where a photo's own symbols need to show which specific
// variant was placed (annotation editor, room lightbox, flattened share).
export function PlacedSymbolGroup({
  symbol, scale = 1, showLabel = false,
}: { symbol: PlacedSymbol; scale?: number; showLabel?: boolean }) {
  return (
    <G transform={`translate(${symbol.x}, ${symbol.y}) scale(${scale})`}>
      <SymbolElements type={symbol.type} color={symbol.color} />
      {showLabel && <SymbolLabel text={SYMBOL_LABELS[symbol.type]} />}
    </G>
  );
}
