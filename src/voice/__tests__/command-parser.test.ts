import { describe, expect, it } from 'vitest';
import { parseVoiceCommand } from '../command-parser';

describe('parseVoiceCommand', () => {
  it('parses a full command with digit quantity and unit', () => {
    const r = parseVoiceCommand('add 50 metres of 2.5mm twin and earth to the Smith job');
    expect(r.quantity).toBe(50);
    expect(r.unit).toBe('m');
    expect(r.itemQuery).toBe('2.5mm twin and earth');
    expect(r.projectQuery).toBe('Smith');
  });

  it('tolerates "put" and "for the ... project"', () => {
    const r = parseVoiceCommand('put 3 each of 20 amp mcb for the Jones project');
    expect(r.quantity).toBe(3);
    expect(r.unit).toBe('each');
    expect(r.itemQuery).toBe('20 amp mcb');
    expect(r.projectQuery).toBe('Jones');
  });

  it('defaults quantity to 1 when missing', () => {
    const r = parseVoiceCommand('add a 32 amp rcbo to the Doyle job');
    expect(r.quantity).toBe(1);
    expect(r.itemQuery).toBe('32 amp rcbo');
    expect(r.projectQuery).toBe('Doyle');
  });

  it('parses spoken decimal numbers ("two point five")', () => {
    const r = parseVoiceCommand('add two point five metres of trunking to the Smith job');
    expect(r.quantity).toBe(2.5);
    expect(r.unit).toBe('m');
    expect(r.itemQuery).toBe('trunking');
  });

  it('parses spoken whole numbers ("fifty")', () => {
    const r = parseVoiceCommand('add fifty metres of twin and earth to the Smith job');
    expect(r.quantity).toBe(50);
    expect(r.unit).toBe('m');
    expect(r.itemQuery).toBe('twin and earth');
  });

  it('leaves a bare leading number in the item text (a cable size, not a count)', () => {
    const r = parseVoiceCommand('add 2.5 twin and earth to the Smith job');
    expect(r.quantity).toBe(1);
    expect(r.itemQuery).toBe('2.5 twin and earth');
  });

  it('falls back to a plain search when there is no add-verb', () => {
    const r = parseVoiceCommand('32 amp RCBO');
    expect(r.quantity).toBe(1);
    expect(r.itemQuery).toBe('32 amp RCBO');
    expect(r.projectQuery).toBeUndefined();
  });
});
