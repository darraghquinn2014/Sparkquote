import { describe, it, expect } from 'vitest';
import { clientMatches, clientNameKey, planClientBackfill } from '../clients';

describe('clientNameKey', () => {
  it('ignores case and extra whitespace', () => {
    expect(clientNameKey('  John   Smith ')).toBe('john smith');
  });
});

describe('planClientBackfill', () => {
  it('creates one client per distinct name and links every project to it', () => {
    const plan = planClientBackfill(
      [
        { id: 'p1', clientName: 'John Smith' },
        { id: 'p2', clientName: ' john  smith' },
        { id: 'p3', clientName: 'Mary Byrne' },
      ],
      [],
    );
    expect(plan.toCreate).toEqual(['John Smith', 'Mary Byrne']);
    expect(plan.links).toEqual([
      { projectId: 'p1', newClientName: 'John Smith' },
      { projectId: 'p2', newClientName: 'John Smith' },
      { projectId: 'p3', newClientName: 'Mary Byrne' },
    ]);
  });

  it('links to an existing client with the same name instead of creating one', () => {
    const plan = planClientBackfill(
      [{ id: 'p1', clientName: 'JOHN SMITH' }],
      [{ id: 'c1', name: 'John Smith' }],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.links).toEqual([{ projectId: 'p1', clientId: 'c1' }]);
  });

  it('skips projects already linked or with no client name', () => {
    const plan = planClientBackfill(
      [
        { id: 'p1', clientName: 'John', clientId: 'c9' },
        { id: 'p2' },
        { id: 'p3', clientName: '   ' },
      ],
      [],
    );
    expect(plan).toEqual({ toCreate: [], links: [] });
  });
});

describe('clientMatches', () => {
  const client = { name: 'John Smith', phone: '07700 900123', address: '12 Main St, Navan' };

  it('matches any field, case-insensitively', () => {
    expect(clientMatches(client, 'smith')).toBe(true);
    expect(clientMatches(client, '900123')).toBe(true);
    expect(clientMatches(client, 'navan')).toBe(true);
    expect(clientMatches(client, 'dublin')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(clientMatches(client, '  ')).toBe(true);
  });
});
