import { http } from '@/api/http';
import type { CreatedPlayer } from '../teams/api';

const randomText = (length: number) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** One Red and one Blue account, enrolled in the exercise, so a dry run can start. Admin only. */
export async function addTestPlayers(drillId: number): Promise<CreatedPlayer[]> {
  const made: CreatedPlayer[] = [];
  for (const role of ['red', 'blue'] as const) {
    const username = `test-${role}-${randomText(5)}`;
    const password = `Tp${randomText(10)}A1!`;
    const created = await http.post<{ id: number }>('/api/v1/auth/users', { sub: username, password, role });
    await http.post(`/api/v2/drills/${drillId}/participants`, { user_id: created.id, role });
    made.push({ name: username, username, password, role, team_id: null });
  }
  return made;
}
