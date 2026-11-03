import { http } from '@/api/http';

export interface TestPlayer {
  sub: string;
  password: string;
  role: 'red' | 'blue';
}

const randomText = (length: number) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** One Red and one Blue account, enrolled in the exercise, so a dry run can start. Admin only. */
export async function addTestPlayers(drillId: number): Promise<TestPlayer[]> {
  const made: TestPlayer[] = [];
  for (const role of ['red', 'blue'] as const) {
    const player: TestPlayer = { sub: `test-${role}-${randomText(5)}`, password: `Tp${randomText(10)}A1!`, role };
    const created = await http.post<{ id: number }>('/api/v1/auth/users', { sub: player.sub, password: player.password, role });
    await http.post(`/api/v2/drills/${drillId}/participants`, { user_id: created.id, role });
    made.push(player);
  }
  return made;
}
