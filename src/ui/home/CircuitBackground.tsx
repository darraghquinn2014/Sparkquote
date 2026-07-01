import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('screen');

const COLOR = '#1B8FFF';
const SW = 1.2;
const R_VIA = 3;
const R_SMALL = 1.8;

/**
 * Each trace is an array of [x, y] waypoints.
 * Every consecutive pair must share either x or y (all orthogonal — no diagonals).
 * Segments are drawn between consecutive points; vias rendered at each point.
 * Coordinates are chosen for a ~400 × 900 dp canvas and look fine on larger screens.
 */
const TRACES: [number, number][][] = [
  // ── Top band ──────────────────────────────────────────
  [[0, 80], [90, 80], [90, 130], [220, 130]],
  [[280, 80], [W, 80]],
  [[220, 130], [220, 80], [280, 80]],
  [[0, 170], [60, 170], [60, 130]],
  [[340, 130], [340, 170], [W, 170]],

  // ── Upper-mid ─────────────────────────────────────────
  [[0, 230], [110, 230], [110, 260], [250, 260]],
  [[310, 230], [W, 230]],
  [[250, 260], [250, 210], [310, 210], [310, 230]],
  [[0, 310], [70, 310]],
  [[150, 310], [W, 310]],
  [[70, 310], [70, 350], [150, 350], [150, 310]],

  // ── Mid ───────────────────────────────────────────────
  [[0, 400], [130, 400], [130, 440], [260, 440]],
  [[320, 380], [W, 380]],
  [[260, 440], [260, 380], [320, 380]],
  [[0, 470], [80, 470], [80, 500]],
  [[80, 500], [200, 500], [200, 460], [W, 460]],

  // ── Lower-mid ─────────────────────────────────────────
  [[0, 550], [160, 550], [160, 590], [W, 590]],
  [[0, 620], [100, 620], [100, 580], [160, 580]],
  [[240, 550], [240, 510], [W, 510]],
  [[0, 660], [90, 660]],
  [[170, 660], [W, 660]],
  [[90, 660], [90, 700], [170, 700], [170, 660]],

  // ── Bottom band ───────────────────────────────────────
  [[0, 740], [140, 740], [140, 780], [W, 780]],
  [[260, 740], [260, 700], [W, 700]],
  [[0, 820], [110, 820], [110, 860], [W, 860]],
  [[220, 820], [220, 780], [320, 780]],
];

// Standalone decorative vias (dots with no trace attached)
const SOLO_VIAS: [number, number][] = [
  [190, 90],  [35,  150], [300, 160], [170, 200],
  [55,  270], [360, 270], [190, 330], [40,  360],
  [330, 340], [200, 420], [60,  490], [340, 490],
  [150, 530], [300, 520], [45,  610], [355, 640],
  [110, 630], [280, 610], [60,  730], [350, 720],
  [180, 760], [90,  800], [310, 800], [200, 840],
];

export function CircuitBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width={W} height={H} opacity={0.08}>
        {TRACES.map((pts, ti) => (
          <G key={`t${ti}`}>
            {/* Line segments */}
            {pts.slice(1).map((pt, i) => (
              <Line
                key={`l${i}`}
                x1={pts[i][0]} y1={pts[i][1]}
                x2={pt[0]}     y2={pt[1]}
                stroke={COLOR}
                strokeWidth={SW}
              />
            ))}
            {/* Vias at each waypoint */}
            {pts.map((pt, i) => (
              <Circle
                key={`v${i}`}
                cx={pt[0]} cy={pt[1]}
                r={i === 0 || i === pts.length - 1 ? R_VIA : R_SMALL}
                fill={COLOR}
              />
            ))}
          </G>
        ))}
        {/* Decorative solo vias */}
        {SOLO_VIAS.map(([x, y], i) => (
          <Circle key={`s${i}`} cx={x} cy={y} r={R_SMALL} fill={COLOR} />
        ))}
      </Svg>
    </View>
  );
}
