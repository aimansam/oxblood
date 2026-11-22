/** Pure helpers for the Reports pages: what to show for a finished exercise. */

export interface TimelineEvent {
  id: number;
  kind: string;
  title: string;
  detail?: string | null;
  side?: string | null;
  actor?: string | null;
  created_at?: string | null;
}

/** The moments worth reading in a report: captures, first blood, objectives and milestones. Not every lifecycle tick. */
const KEY_KINDS = new Set(['flag', 'first-blood', 'objective', 'milestone', 'announcement']);

export function keyEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((e) => KEY_KINDS.has(e.kind)).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
}

/** "1 h 05 min", "42 min", "—" for a duration in seconds. */
export function durationText(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** The seconds an exercise ran, from its recorded start and end (the API sends UTC without a zone suffix). */
export function playedSeconds(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const utc = (v: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`).getTime();
  const seconds = (utc(end) - utc(start)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
