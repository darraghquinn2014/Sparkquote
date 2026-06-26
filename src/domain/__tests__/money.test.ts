import { describe, it, expect } from 'vitest';
import { roundMinor, applyFactor, sumMinor, formatMoney } from '../money';

describe('money', () => {
  describe('roundMinor (half-up, away from zero)', () => {
    it('rounds half up', () => {
      expect(roundMinor(0.5)).toBe(1);
      expect(roundMinor(1.5)).toBe(2);
      expect(roundMinor(2.5)).toBe(3);
    });
    it('rounds half away from zero for negatives', () => {
      expect(roundMinor(-0.5)).toBe(-1);
      expect(roundMinor(-1.5)).toBe(-2);
    });
    it('leaves integers untouched', () => {
      expect(roundMinor(1250)).toBe(1250);
      expect(roundMinor(0)).toBe(0);
    });
    it('throws on non-finite input', () => {
      expect(() => roundMinor(NaN)).toThrow();
      expect(() => roundMinor(Infinity)).toThrow();
    });
  });

  describe('applyFactor', () => {
    it('applies a markup and rounds to whole minor units', () => {
      // £10.00 + 20% = £12.00
      expect(applyFactor(1000, 1.2)).toBe(1200);
    });
    it('rounds fractional results to the penny', () => {
      // 999 × 1.2 = 1198.8 → 1199
      expect(applyFactor(999, 1.2)).toBe(1199);
    });
  });

  describe('sumMinor', () => {
    it('sums integer amounts exactly', () => {
      expect(sumMinor([1250, 375, 9999])).toBe(11624);
    });
    it('handles empty arrays', () => {
      expect(sumMinor([])).toBe(0);
    });
  });

  describe('formatMoney', () => {
    it('formats GBP', () => {
      expect(formatMoney(1250, 'GBP')).toBe('£12.50');
    });
    it('formats EUR with IE locale', () => {
      // en-IE renders euro with the € symbol prefix
      expect(formatMoney(1250, 'EUR')).toContain('12.50');
      expect(formatMoney(1250, 'EUR')).toContain('€');
    });
  });
});
