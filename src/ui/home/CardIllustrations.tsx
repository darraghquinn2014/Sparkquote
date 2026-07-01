import React from 'react';
import Svg, { Path, Rect, Line, Circle } from 'react-native-svg';

interface IllustrationProps {
  color: string;
  size?: number;
}

/** House with door and windows — Projects */
export function HouseIllustration({ color, size = 80 }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      {/* Roof */}
      <Path
        d="M8,36 L40,8 L72,36"
        stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Chimney */}
      <Rect x="52" y="14" width="8" height="14" stroke={color} strokeWidth={2} fill="none" />
      {/* Wall */}
      <Rect x="14" y="36" width="52" height="36" stroke={color} strokeWidth={2.5} fill="none" />
      {/* Door */}
      <Rect x="32" y="52" width="16" height="20" rx="8" stroke={color} strokeWidth={2} fill="none" />
      {/* Left window */}
      <Rect x="18" y="42" width="10" height="9" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1="23" y1="42" x2="23" y2="51" stroke={color} strokeWidth={1} />
      <Line x1="18" y1="46.5" x2="28" y2="46.5" stroke={color} strokeWidth={1} />
      {/* Right window */}
      <Rect x="52" y="42" width="10" height="9" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      <Line x1="57" y1="42" x2="57" y2="51" stroke={color} strokeWidth={1} />
      <Line x1="52" y1="46.5" x2="62" y2="46.5" stroke={color} strokeWidth={1} />
    </Svg>
  );
}

/** Lightning bolt — Quick Quote */
export function LightningIllustration({ color, size = 70 }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 70 70">
      {/* Main bold bolt */}
      <Path
        d="M42,4 L22,38 L36,38 L28,66 L58,28 L43,28 Z"
        fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round"
      />
      {/* Small spark dots */}
      <Circle cx="14" cy="20" r="2.5" fill={color} />
      <Circle cx="8" cy="32" r="1.8" fill={color} />
      <Circle cx="18" cy="10" r="1.8" fill={color} />
      <Circle cx="62" cy="48" r="2.5" fill={color} />
      <Circle cx="58" cy="58" r="1.5" fill={color} />
    </Svg>
  );
}

/** Receipt / document — Estimate */
export function ReceiptIllustration({ color, size = 70 }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 70 70">
      {/* Page body */}
      <Path
        d="M12,4 L50,4 L58,12 L58,66 L12,66 Z"
        stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round"
      />
      {/* Folded corner */}
      <Path
        d="M50,4 L50,12 L58,12"
        stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round"
      />
      {/* Text lines */}
      <Line x1="20" y1="24" x2="50" y2="24" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="20" y1="33" x2="50" y2="33" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="20" y1="42" x2="42" y2="42" stroke={color} strokeWidth={2} strokeLinecap="round" />
      {/* Divider */}
      <Line x1="20" y1="51" x2="50" y2="51" stroke={color} strokeWidth={1} strokeLinecap="round" />
      {/* Total line — bolder */}
      <Line x1="20" y1="58" x2="50" y2="58" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Shelves with electrical components — Catalogue */
export function ShelvesIllustration({ color, size = 60 }: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      {/* Vertical sides */}
      <Line x1="6" y1="4" x2="6" y2="56" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="54" y1="4" x2="54" y2="56" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {/* Shelves */}
      <Line x1="6" y1="22" x2="54" y2="22" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="6" y1="40" x2="54" y2="40" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="6" y1="56" x2="54" y2="56" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {/* Top shelf items */}
      <Rect x="10" y="10" width="12" height="12" rx="1.5" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="26" y="13" width="8" height="9" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="38" y="10" width="12" height="12" rx="1.5" stroke={color} strokeWidth={1.5} fill="none" />
      {/* Middle shelf items */}
      <Rect x="10" y="28" width="16" height="12" rx="1.5" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="30" y="30" width="10" height="10" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="44" y="28" width="6" height="12" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      {/* Bottom shelf items */}
      <Rect x="10" y="46" width="10" height="10" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="24" y="44" width="14" height="12" rx="1.5" stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x="42" y="47" width="8" height="9" rx="1" stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
