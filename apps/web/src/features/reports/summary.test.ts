import { describe, expect, it } from 'vitest';
import { type TimelineEvent, durationText, keyEvents, playedSeconds } from './summary';

const ev = (id: number, kind: string, at: string): TimelineEvent => ({ id, kind, title: `${kind} ${id}`, created_at: at });

describe('keyEvents', () => {
  it('keeps captures and objectives, drops lifecycle noise, oldest first', () => {
    const events = [ev(3, 'flag', '2026-11-01T10:30:00'), ev(1, 'lifecycle', '2026-11-01T10:00:00'), ev(2, 'first-blood', '2026-11-01T10:10:00'), ev(4, 'note', '2026-11-01T11:00:00')];
    expect(keyEvents(events).map((e) => e.id)).toEqual([2, 3]);
  });
  it('is empty for an exercise that recorded nothing', () => {
    expect(keyEvents([])).toEqual([]);
  });
});

describe('durationText', () => {
  it('reads minutes and hours', () => {
    expect(durationText(42 * 60)).toBe('42 min');
    expect(durationText(65 * 60)).toBe('1 h 05 min');
  });
  it('shows a dash when unknown', () => {
    expect(durationText(null)).toBe('—');
    expect(durationText(undefined)).toBe('—');
    expect(durationText(-5)).toBe('—');
  });
});

describe('playedSeconds', () => {
  it('treats a zone-less API time as UTC', () => {
    expect(playedSeconds('2026-11-01T10:00:00', '2026-11-01T11:30:00')).toBe(5400);
    expect(playedSeconds('2026-11-01T10:00:00Z', '2026-11-01T10:30:00+00:00')).toBe(1800);
  });
  it('is null without both ends or when the end is before the start', () => {
    expect(playedSeconds(null, '2026-11-01T10:00:00')).toBeNull();
    expect(playedSeconds('2026-11-01T11:00:00', '2026-11-01T10:00:00')).toBeNull();
  });
});
