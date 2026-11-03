import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { http } from '@/api/http';
import type { components } from '@/api/schema';

export type Participant = components['schemas']['ParticipantOut'];
export type Candidate = components['schemas']['CandidateOut'];

export interface CreatedPlayer {
  name: string;
  username: string;
  password: string;
  role: 'red' | 'blue';
  team_id: number | null;
  /** The generated password must be replaced at first sign-in. */
  must_change_password?: boolean;
}

export const participantName = (p: Participant) => p.username || p.sub || `User ${p.user_id}`;

export const teamsApi = {
  /** Accounts from a pasted list of names. Passwords come back once, in this response. Admin only. */
  bulkCreate: (drillId: number, body: { names: string[]; side: 'red' | 'blue'; team_id?: number }) =>
    http.post<{ players: CreatedPlayer[] }>(`/api/v2/drills/${drillId}/participants/bulk`, body),
  assign: (drillId: number, userId: number, role: 'red' | 'blue') => http.post<unknown>(`/api/v2/drills/${drillId}/participants`, { user_id: userId, role }),
  remove: (drillId: number, userId: number) => http.delete<unknown>(`/api/v2/drills/${drillId}/participants/${userId}`),
};

export function useRoster(drillId: number | null) {
  return useQuery({
    queryKey: ['roster', drillId],
    enabled: drillId !== null,
    queryFn: async () => {
      const path = { params: { path: { drill_id: drillId as number } } };
      const [people, candidates] = await Promise.all([
        api.GET('/api/v2/drills/{drill_id}/participants', path).then(unwrap),
        api.GET('/api/v2/drills/{drill_id}/roster-candidates', path).then(unwrap).catch(() => ({ candidates: [] as Candidate[] })),
      ]);
      return {
        // Removed and departed players stay in the table but are not on the team any more.
        participants: people.participants.filter((p) => !['removed', 'left'].includes(String(p.status ?? '').toLowerCase())),
        candidates: candidates.candidates,
      };
    },
  });
}
