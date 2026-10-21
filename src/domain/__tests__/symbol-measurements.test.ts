import { describe, it, expect } from 'vitest';
import { measureSymbol, symbolMeasurementText } from '../symbol-measurements';

describe('measureSymbol', () => {
  it('works out distance from each end and height above the floor', () => {
    const m = measureSymbol({ positionAlongWall: 0.25, photoY: 0.5 }, 4, 2.4);
    expect(m.fromEnds!.start).toBeCloseTo(1);
    expect(m.fromEnds!.end).toBeCloseTo(3);
    expect(m.heightAboveFloor).toBeCloseTo(1.2);
  });

  it('leaves out a figure whose input is missing', () => {
    expect(measureSymbol({ positionAlongWall: 0.5, photoY: 0.5 }, null, 2.4).fromEnds).toBeNull();
    expect(measureSymbol({ positionAlongWall: 0.5, photoY: 0.5 }, 4, undefined).heightAboveFloor).toBeNull();
  });
});

describe('symbolMeasurementText', () => {
  it('shows height then both distances', () => {
    const m = measureSymbol({ positionAlongWall: 0.72, photoY: 0.49 }, 4.97, 2.4);
    expect(symbolMeasurementText(m)).toBe('1.22m high · 3.58m / 1.39m from ends');
  });

  it('shows whichever figure is available', () => {
    expect(symbolMeasurementText(measureSymbol({ positionAlongWall: 0.5, photoY: 0.5 }, null, 2.4))).toBe('1.20m high');
    expect(symbolMeasurementText(measureSymbol({ positionAlongWall: 0.5, photoY: 0.5 }, 4, null))).toBe('2.00m / 2.00m from ends');
  });

  it('is null when nothing can be measured', () => {
    expect(symbolMeasurementText(measureSymbol({ positionAlongWall: 0.5, photoY: 0.5 }, null, null))).toBeNull();
  });
});
