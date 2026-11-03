export interface RosterTarget {
  id: number;
  name: string;
  side: 'red' | 'blue';
}

export interface RosterRow {
  name: string;
  side: 'red' | 'blue';
  teamId?: number;
  teamName?: string;
}

export interface ParsedRoster {
  rows: RosterRow[];
  errors: string[];
}

/**
 * One person per line. "Ana Smith" goes to the default target; "Ana Smith, Bravo" goes to team Bravo
 * (or, in an exercise without teams, "Ana Smith, blue" to the Blue side). A tab works like a comma, so a
 * column pasted from a spreadsheet works too.
 */
export function parseRoster(text: string, teams: RosterTarget[], fallback: { side: 'red' | 'blue'; teamId?: number }): ParsedRoster {
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const lines = text.split('\n');
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const split = line.search(/[,\t]/);
    const name = (split < 0 ? line : line.slice(0, split)).trim();
    const where = split < 0 ? '' : line.slice(split + 1).trim();
    if (!name) return errors.push(`Line ${index + 1}: a name is missing.`);
    if (!where) {
      const team = teams.find((t) => t.id === fallback.teamId);
      return rows.push({ name, side: fallback.side, teamId: fallback.teamId, teamName: team?.name });
    }
    const wanted = where.toLowerCase();
    const team = teams.find((t) => t.name.toLowerCase() === wanted);
    if (team) return rows.push({ name, side: team.side, teamId: team.id, teamName: team.name });
    if (teams.length === 0 && (wanted === 'red' || wanted === 'blue')) return rows.push({ name, side: wanted });
    errors.push(teams.length ? `Line ${index + 1}: there is no team called "${where}".` : `Line ${index + 1}: use red or blue after the comma.`);
  });
  return { rows, errors };
}

/** Rows grouped by where they go, in first-seen order, because the server takes one place per call. */
export function groupRoster(rows: RosterRow[]): { side: 'red' | 'blue'; teamId?: number; names: string[] }[] {
  const groups = new Map<string, { side: 'red' | 'blue'; teamId?: number; names: string[] }>();
  for (const row of rows) {
    const key = `${row.side}:${row.teamId ?? ''}`;
    const group = groups.get(key) ?? { side: row.side, teamId: row.teamId, names: [] };
    group.names.push(row.name);
    groups.set(key, group);
  }
  return [...groups.values()];
}
