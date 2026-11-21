const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The line under the Scoreboard title: teams and players for a team competition, otherwise scored participants. */
export function scoreboardSummary(teams: { members?: number | null }[], participants: number): string {
  if (teams.length === 0) return plural(participants, 'participant');
  const players = teams.reduce((sum, t) => sum + (t.members ?? 0), 0);
  return `${plural(teams.length, 'team')} · ${plural(players, 'player')}`;
}
