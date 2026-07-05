import { describe, expect, it } from 'vitest';
import { matchNavTarget, matchProjectNavTarget } from '../nav-targets';

describe('matchNavTarget', () => {
  it('matches a known screen by exact phrase', () => {
    expect(matchNavTarget('settings')?.path).toBe('/settings');
  });

  it('matches by substring/synonym', () => {
    expect(matchNavTarget('the projects')?.path).toBe('/projects');
    expect(matchNavTarget('catalog')?.path).toBe('/catalogue');
  });

  it('returns null for no match', () => {
    expect(matchNavTarget('the Smith job')).toBeNull();
  });

  it('matches the tools hub and calculators', () => {
    expect(matchNavTarget('tools')?.path).toBe('/tools');
    expect(matchNavTarget('voltage drop')?.path).toBe('/tools/voltage-drop');
    expect(matchNavTarget('ohms law')?.path).toBe('/tools/ohms-law');
  });
});

describe('matchProjectNavTarget', () => {
  it('resolves a contextual snag-list target', () => {
    const target = matchProjectNavTarget('snags');
    expect(target?.path('proj1')).toBe('/project/snag/proj1');
  });

  it('resolves "snag list" — the leading "the" is already stripped by the caller (NAV_RE) before this is reached', () => {
    const target = matchProjectNavTarget('snag list');
    expect(target?.path('proj1')).toBe('/project/snag/proj1');
  });

  it('resolves a contextual quote target', () => {
    const target = matchProjectNavTarget('the quote');
    expect(target?.path('proj1')).toBe('/project/quote/proj1');
  });

  it('resolves the quote target from the bare word "quote" too', () => {
    const target = matchProjectNavTarget('quote');
    expect(target?.path('proj1')).toBe('/project/quote/proj1');
  });

  it('returns null for no match', () => {
    expect(matchProjectNavTarget('bananas')).toBeNull();
  });
});
