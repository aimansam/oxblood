import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, copiesOf, memoryEstimate } from './format';

describe('format', () => {
  it('asks for one range copy per match, only for separate team matches', () => {
    expect(copiesOf(DEFAULT_FORMAT)).toBe(1);
    expect(copiesOf({ ...DEFAULT_FORMAT, mode: 'team', teams: 4, layout: 'shared' })).toBe(1);
    expect(copiesOf({ ...DEFAULT_FORMAT, mode: 'team', teams: 4, layout: 'separate' })).toBe(2);
    expect(copiesOf({ ...DEFAULT_FORMAT, mode: 'team', teams: 6, layout: 'separate' })).toBe(3);
  });
  it('multiplies the range memory by the copies and compares it with what is free', () => {
    const gib = 1024 ** 3;
    const checks = [{ id: 'memory', required_bytes: 8 * gib, available_bytes: 15 * gib }];
    expect(memoryEstimate(checks, 1)).toMatchObject({ totalGiB: 8, fits: true });
    expect(memoryEstimate(checks, 2)).toMatchObject({ perCopyGiB: 8, totalGiB: 16, availableGiB: 15, fits: false });
  });
  it('says nothing when the node cannot report its memory', () => {
    expect(memoryEstimate([], 2)).toBeNull();
    expect(memoryEstimate([{ id: 'memory', required_bytes: 1024 ** 3 }], 2)?.fits).toBeNull();
  });
});
