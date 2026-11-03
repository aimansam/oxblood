import { describe, expect, it } from 'vitest';
import { credentialsCsv } from './Credentials';

describe('credentialsCsv', () => {
  it('writes a header and one row per player', () => {
    const csv = credentialsCsv([{ name: 'Ana Smith', username: 'ana.smith', password: 'abc123XYZ789', role: 'red', team_id: 1 }]);
    expect(csv.split('\n')).toEqual(['name,username,password,side', 'Ana Smith,ana.smith,abc123XYZ789,red']);
  });
  it('neutralises spreadsheet formulas and quotes awkward text', () => {
    const csv = credentialsCsv([{ name: '=HYPERLINK("x")', username: 'u', password: 'p,q', role: 'blue', team_id: null }]);
    const row = csv.split('\n')[1];
    expect(row.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true); // a leading = is defused, quotes doubled
    expect(row).toContain('"p,q"'); // a comma keeps the cell whole
  });
});
