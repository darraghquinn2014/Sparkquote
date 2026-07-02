/**
 * Electrical symbol definitions and SVG rendering for annotation overlays.
 *
 * Each symbol is drawn in a coordinate space centered at (0,0) and
 * translated to the placed (x,y) position via a <G transform> in the
 * caller's SVG canvas.
 */
import React from 'react';
import { G, Circle, Rect, Line, Path } from 'react-native-svg';
import type { SymbolType, PlacedSymbol } from '@/src/media/annotation-service';

export const SYMBOL_TYPES: SymbolType[] = [
  'socket',
  'switch',
  'ceiling_rose',
  'downlight',
  'consumer_unit',
  'junction_box',
  'smoke_detector',
  'fan',
];

export const SYMBOL_LABELS: Record<SymbolType, string> = {
  socket: 'Socket',
  switch: 'Switch',
  ceiling_rose: 'Ceiling rose',
  downlight: 'Downlight',
  consumer_unit: 'Con. unit',
  junction_box: 'J-box',
  smoke_detector: 'Smoke det.',
  fan: 'Fan',
};

/** One fixed colour per symbol type — no per-placement colour choice. */
export const SYMBOL_TYPE_COLORS: Record<SymbolType, string> = {
  socket: '#FFFFFF',
  switch: '#1B8FFF',
  ceiling_rose: '#F0B730',
  downlight: '#FFD166',
  consumer_unit: '#FF3B30',
  junction_box: '#9B5DE5',
  smoke_detector: '#FF7043',
  fan: '#06D6A0',
};

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

  switch (type) {
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

// Drop this inside any <Svg> to render a placed symbol at its stored (x, y).
// scale defaults to 1 (matches in-app on-screen rendering); pass a larger
// value when rendering onto a higher-resolution canvas (e.g. a flattened
// share export) so the glyph stays the same size RELATIVE to the image,
// rather than shrinking to a fixed absolute pixel size.
export function PlacedSymbolGroup({ symbol, scale = 1 }: { symbol: PlacedSymbol; scale?: number }) {
  return (
    <G transform={`translate(${symbol.x}, ${symbol.y}) scale(${scale})`}>
      <SymbolElements type={symbol.type} color={symbol.color} />
    </G>
  );
}
