import { http } from '@/api/http';
import type { CreatedPlayer } from '../teams/api';

/** One Red and one Blue account, enrolled in the exercise, so a dry run can start. Admin only; destroyed after cleanup. */
export async function addTestPlayers(drillId: number): Promise<CreatedPlayer[]> {
  return (await http.post<{ players: CreatedPlayer[] }>(`/api/v2/drills/${drillId}/participants/test`)).players;
}
