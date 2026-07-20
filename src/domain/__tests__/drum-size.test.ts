import { describe, expect, it } from 'vitest';
import { drumLengthMeters, drumsNeededFor } from '../drum-size';

describe('drumLengthMeters', () => {
  it('reads the length preceding "Drum"', () => {
    expect(drumLengthMeters('Twin & Earth 2.5mm² 100m Drum')).toBe(100);
  });

  it('ignores an "mm" cross-section spec, not just the last number', () => {
    expect(drumLengthMeters('SWA Armoured 6.0mm² 3-core 50m Drum')).toBe(50);
  });

  it('handles a decimal drum length', () => {
    expect(drumLengthMeters('Flex Cable 0.75mm² 45.5m Drum')).toBe(45.5);
  });

  it('returns null when there is no "Drum" mention', () => {
    expect(drumLengthMeters('Twin & Earth 6242Y 2.5mm² (per m)')).toBeNull();
  });

  it('returns null when a drum is mentioned with no parseable length', () => {
    expect(drumLengthMeters('SWA Armoured Cable Drum')).toBeNull();
  });
});

describe('drumsNeededFor', () => {
  it('rounds up to a whole drum', () => {
    expect(drumsNeededFor(150, 100)).toBe(2);
  });

  it('needs exactly one drum when the length matches exactly', () => {
    expect(drumsNeededFor(100, 100)).toBe(1);
  });

  it('never returns zero drums even for a tiny amount', () => {
    expect(drumsNeededFor(1, 100)).toBe(1);
  });
});
