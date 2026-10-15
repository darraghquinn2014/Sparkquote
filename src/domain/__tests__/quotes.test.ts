import { describe, it, expect } from 'vitest';
import { chaseUpMessage, copyAsNewDraft, daysSince, needsChaseUp, statusChange } from '../quotes';
import type { Estimate } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 12);

describe('daysSince', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysSince(NOW - 3 * DAY - 1000, NOW)).toBe(3);
    expect(daysSince(NOW - 2.9 * DAY, NOW)).toBe(2);
    expect(daysSince(NOW + DAY, NOW)).toBe(0);
  });
});

describe('needsChaseUp', () => {
  it('flags a sent quote after 3 days', () => {
    expect(needsChaseUp({ status: 'sent', sentAt: NOW - 3 * DAY }, NOW)).toBe(true);
    expect(needsChaseUp({ status: 'sent', sentAt: NOW - 2 * DAY }, NOW)).toBe(false);
  });

  it('ignores quotes that are not awaiting a reply', () => {
    for (const status of ['draft', 'accepted', 'declined', 'invoiced'] as const) {
      expect(needsChaseUp({ status, sentAt: NOW - 30 * DAY }, NOW)).toBe(false);
    }
    expect(needsChaseUp({ status: 'sent' }, NOW)).toBe(false);
  });
});

describe('statusChange', () => {
  it('stamps sentAt the first time a quote leaves draft', () => {
    expect(statusChange({}, 'sent', NOW)).toEqual({ status: 'sent', statusChangedAt: NOW, sentAt: NOW });
    expect(statusChange({}, 'accepted', NOW).sentAt).toBe(NOW);
  });

  it('keeps the original sentAt on later changes', () => {
    const sentAt = NOW - 5 * DAY;
    expect(statusChange({ sentAt }, 'sent', NOW).sentAt).toBe(sentAt);
    expect(statusChange({ sentAt }, 'invoiced', NOW).sentAt).toBe(sentAt);
  });

  it('leaves sentAt unset for a draft that was never sent', () => {
    expect(statusChange({}, 'draft', NOW)).toEqual({ status: 'draft', statusChangedAt: NOW });
  });
});

describe('chaseUpMessage', () => {
  it('greets by first name and signs off with the business', () => {
    const msg = chaseUpMessage({
      clientName: 'John Smith', sentAt: NOW - 3 * DAY, totalText: '£281.76', businessName: 'Quinn Electrical',
    });
    expect(msg).toMatch(/^Hi John, just following up on the quote I sent on 13 Oct for £281\.76\./);
    expect(msg.endsWith('Thanks,\nQuinn Electrical')).toBe(true);
  });

  it('works without a client or business name', () => {
    const msg = chaseUpMessage({ sentAt: NOW, totalText: '£10.00' });
    expect(msg.startsWith('Hi, just following up')).toBe(true);
    expect(msg.endsWith('Thanks')).toBe(true);
  });
});

describe('copyAsNewDraft', () => {
  const source: Estimate = {
    id: 'q1', mode: 'project', status: 'invoiced', currency: 'GBP', hourlyRateMinor: 5500, vatRatePct: 20,
    appliedLaborToggleIds: ['t1'], clientId: 'c1', clientName: 'John', sentAt: 1, statusChangedAt: 2, createdAt: 3,
    lineItems: [
      { id: 'l1', description: 'Socket', resolvedMaterialCostMinor: 500, laborBaseHours: 1, quantity: 2, appliedLaborToggleIds: [], locationId: 'room1' },
      { id: 'l2', description: 'Cable', resolvedMaterialCostMinor: 90, laborBaseHours: 0, quantityMeters: 10, appliedLaborToggleIds: [] },
    ],
  };
  let n = 0;
  const copy = copyAsNewDraft(source, { estimateId: 'new', lineId: () => `nl${++n}` });

  it('resets to a quick draft with no dates', () => {
    expect(copy).toMatchObject({ id: 'new', mode: 'quick', status: 'draft' });
    expect(copy.sentAt).toBeUndefined();
    expect(copy.statusChangedAt).toBeUndefined();
    expect(copy.createdAt).toBeUndefined();
  });

  it('keeps client, rates and items, with new line ids and no rooms', () => {
    expect(copy).toMatchObject({ clientId: 'c1', clientName: 'John', hourlyRateMinor: 5500, appliedLaborToggleIds: ['t1'] });
    expect(copy.lineItems.map((l) => l.id)).toEqual(['nl1', 'nl2']);
    expect(copy.lineItems[0]).not.toHaveProperty('locationId');
    expect(copy.lineItems[0]).toMatchObject({ description: 'Socket', quantity: 2, resolvedMaterialCostMinor: 500 });
    expect(copy.lineItems[1]).toMatchObject({ quantityMeters: 10 });
  });

  it('leaves the source untouched', () => {
    expect(source.lineItems[0]!.id).toBe('l1');
    expect(source.status).toBe('invoiced');
  });
});
