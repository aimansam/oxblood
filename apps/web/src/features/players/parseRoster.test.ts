import { describe, expect, it } from 'vitest';
import { groupRoster, parseRoster } from './parseRoster';

const teams = [
  { id: 1, name: 'Alpha', side: 'red' as const },
  { id: 2, name: 'Bravo', side: 'red' as const },
  { id: 3, name: 'Charlie', side: 'blue' as const },
];

describe('parseRoster', () => {
  it('sends a plain name to the default team and "Name, Team" to that team', () => {
    const { rows, errors } = parseRoster('Ana Smith\nBen Lee, bravo\n\nCara\tCharlie', teams, { side: 'red', teamId: 1 });
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: 'Ana Smith', side: 'red', teamId: 1, teamName: 'Alpha' },
      { name: 'Ben Lee', side: 'red', teamId: 2, teamName: 'Bravo' },
      { name: 'Cara', side: 'blue', teamId: 3, teamName: 'Charlie' },
    ]);
  });
  it('names the line when a team does not exist', () => {
    const { rows, errors } = parseRoster('Ana, Alpha\nBen, Delta\n, Alpha', teams, { side: 'red', teamId: 1 });
    expect(rows).toHaveLength(1);
    expect(errors).toEqual(['Line 2: there is no team called "Delta".', 'Line 3: a name is missing.']);
  });
  it('takes red or blue after the comma when there are no teams', () => {
    const { rows, errors } = parseRoster('Ana\nBen, Blue\nCara, green', [], { side: 'red' });
    expect(rows.map((r) => [r.name, r.side])).toEqual([['Ana', 'red'], ['Ben', 'blue']]);
    expect(errors).toEqual(['Line 3: use red or blue after the comma.']);
  });
  it('groups people by where they go, keeping the order', () => {
    const { rows } = parseRoster('A\nB, Bravo\nC, Alpha\nD, Bravo', teams, { side: 'red', teamId: 1 });
    expect(groupRoster(rows)).toEqual([
      { side: 'red', teamId: 1, names: ['A', 'C'] },
      { side: 'red', teamId: 2, names: ['B', 'D'] },
    ]);
  });
});
