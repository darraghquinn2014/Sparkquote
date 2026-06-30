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

// All symbols drawn centered at origin in a ~40×40 dp coordinate space.
function SymbolElements({ type, color }: { type: SymbolType; color: string }) {
  const s = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (type) {
    case 'socket':
      // UK BS 1363: outer box, earth pin slot at top, live/neutral holes below
      return (
        <G>
          <Rect x={-16} y={-12} width={32} height={26} rx={2} {...s} />
          <Rect x={-4} y={-20} width={8} height={10} {...s} />
          <Rect x={-18} y={-2} width={8} height={6} {...s} />
          <Rect x={10} y={-2} width={8} height={6} {...s} />
        </G>
      );

    case 'switch':
      // Rectangle body with diagonal actuator line
      return (
        <G>
          <Rect x={-16} y={-10} width={32} height={20} rx={2} {...s} />
          <Line x1={-16} y1={8} x2={16} y2={-8} {...s} />
        </G>
      );

    case 'ceiling_rose':
      // Circle with cross — four conductors entering
      return (
        <G>
          <Circle cx={0} cy={0} r={16} {...s} />
          <Line x1={0} y1={-16} x2={0} y2={16} {...s} />
          <Line x1={-16} y1={0} x2={16} y2={0} {...s} />
        </G>
      );

    case 'downlight':
      // Concentric circles — recessed fitting
      return (
        <G>
          <Circle cx={0} cy={0} r={16} {...s} />
          <Circle cx={0} cy={0} r={5} {...s} />
        </G>
      );

    case 'consumer_unit':
      // Rectangular board divided into header + circuit cells
      return (
        <G>
          <Rect x={-18} y={-18} width={36} height={36} rx={2} {...s} />
          <Line x1={-18} y1={-10} x2={18} y2={-10} {...s} />
          <Line x1={-8} y1={-10} x2={-8} y2={18} {...s} />
          <Line x1={2} y1={-10} x2={2} y2={18} {...s} />
          <Line x1={12} y1={-10} x2={12} y2={18} {...s} />
        </G>
      );

    case 'junction_box':
      // Circle with centre dot — cable splice point
      return (
        <G>
          <Circle cx={0} cy={0} r={16} {...s} />
          <Circle cx={0} cy={0} r={4} {...s} />
        </G>
      );

    case 'smoke_detector':
      // Disc body with wavy smoke lines above
      return (
        <G>
          <Circle cx={0} cy={6} r={12} {...s} />
          <Path d="M -8 -4 Q -4 -12 0 -4 Q 4 -12 8 -4" {...s} />
        </G>
      );

    case 'fan':
      // Outer ring with four curved petal blades and a hub
      return (
        <G>
          <Circle cx={0} cy={0} r={16} {...s} />
          {/* blades — cubic bezier petals at 90° intervals */}
          <Path d="M0,0 C4,-6 6,-14 0,-16 C-6,-14 -4,-6 0,0" {...s} />
          <Path d="M0,0 C6,4 14,6 16,0 C14,-6 6,-4 0,0" {...s} />
          <Path d="M0,0 C-4,6 -6,14 0,16 C6,14 4,6 0,0" {...s} />
          <Path d="M0,0 C-6,-4 -14,-6 -16,0 C-14,6 -6,4 0,0" {...s} />
          <Circle cx={0} cy={0} r={3} stroke={color} strokeWidth={2} fill={color} />
        </G>
      );

    default:
      return null;
  }
}

// Drop this inside any <Svg> to render a placed symbol at its stored (x, y).
export function PlacedSymbolGroup({ symbol }: { symbol: PlacedSymbol }) {
  return (
    <G transform={`translate(${symbol.x}, ${symbol.y})`}>
      <SymbolElements type={symbol.type} color={symbol.color} />
    </G>
  );
}
