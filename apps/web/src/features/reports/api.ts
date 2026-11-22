import { useQuery } from '@tanstack/react-query';
import { http } from '@/api/http';
import type { TimelineEvent } from './summary';

/** How the exercise played (the same read-only report the pilot comparison uses): timings plus plain-language notes. */
export interface Quality {
  drill?: { duration_s?: number | null; planned_minutes?: number | null };
  observations?: string[];
}

export const useQuality = (drillId: number | null) =>
  useQuery({
    queryKey: ['quality', drillId],
    enabled: drillId !== null,
    queryFn: async () => http.get<Quality>(`/api/v2/drills/${drillId}/quality`),
    retry: false,
  });

export const useTimeline = (drillId: number | null) =>
  useQuery({
    queryKey: ['timeline', drillId],
    enabled: drillId !== null,
    queryFn: async () => (await http.get<{ events?: TimelineEvent[] }>(`/api/v2/drills/${drillId}/timeline?limit=500`)).events ?? [],
  });
