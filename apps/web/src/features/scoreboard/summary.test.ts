import { describe, expect, it } from 'vitest';
import { scoreboardSummary } from './summary';

describe('scoreboardSummary', () => {
  it('counts teams and their players in a team competition', () => {
    expect(scoreboardSummary([{ members: 3 }, { members: 3 }], 0)).toBe('2 teams · 6 players');
  });
  it('uses singular forms', () => {
    expect(scoreboardSummary([{ members: 1 }], 0)).toBe('1 team · 1 player');
  });
  it('treats a missing member count as no players', () => {
    expect(scoreboardSummary([{}, { members: null }], 0)).toBe('2 teams · 0 players');
  });
  it('falls back to scored participants without teams', () => {
    expect(scoreboardSummary([], 0)).toBe('0 participants');
    expect(scoreboardSummary([], 1)).toBe('1 participant');
    expect(scoreboardSummary([], 4)).toBe('4 participants');
  });
});
