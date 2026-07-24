import { describe, expect, it } from 'vitest';
import { packSize, packsNeededFor } from '../pack-size';

describe('packSize', () => {
  it('reads the count out of "(bag of N)"', () => {
    expect(packSize('Cable ties (bag of 100)')).toBe(100);
  });

  it('reads the count out of "(box of N)"', () => {
    expect(packSize('Junction box lids (box of 25)')).toBe(25);
  });

  it('reads the count out of "(pack of N)"', () => {
    expect(packSize('Wire nuts (pack of 50)')).toBe(50);
  });

  it('is case-insensitive', () => {
    expect(packSize('Rawlplugs (BAG OF 100)')).toBe(100);
  });

  it('returns null when there is no pack mention', () => {
    expect(packSize('Twin & Earth Cable 2.5mm Grey (per 100m unless noted)')).toBeNull();
  });

  it('returns null for a zero-count pack', () => {
    expect(packSize('Odd item (bag of 0)')).toBeNull();
  });

  it('reads a short "box N" unit string (no "of", no parentheses)', () => {
    expect(packSize('box 100')).toBe(100);
  });

  it('reads a short "pack N" unit string', () => {
    expect(packSize('pack 50')).toBe(50);
  });

  it('returns null for a bare "pack" unit with no count', () => {
    expect(packSize('pack')).toBeNull();
  });

  it('returns null for a bare "roll" unit with no count', () => {
    expect(packSize('roll')).toBeNull();
  });

  it('returns null for "each"', () => {
    expect(packSize('each')).toBeNull();
  });
});

describe('packsNeededFor', () => {
  it('rounds up to a whole pack', () => {
    expect(packsNeededFor(300, 100)).toBe(3);
  });

  it('rounds up when not an exact multiple', () => {
    expect(packsNeededFor(250, 100)).toBe(3);
  });

  it('needs exactly one pack when the count matches exactly', () => {
    expect(packsNeededFor(100, 100)).toBe(1);
  });

  it('never returns zero packs even for a tiny amount', () => {
    expect(packsNeededFor(1, 100)).toBe(1);
  });
});
