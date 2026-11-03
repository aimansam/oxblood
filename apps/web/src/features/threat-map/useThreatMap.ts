import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/api/http';
import type { ThreatMapPayload } from './map/types';

/** The live topology for one exercise, refreshed every few seconds. Operators may ask for any match's range copy. */
export function useThreatMap(drillId: number, match = 1) {
  return useQuery({
    queryKey: ['threat-map', drillId, match],
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
    queryFn: () => http.get<ThreatMapPayload>(`/api/v2/drills/${drillId}/threat-map${match > 1 ? `?match=${match}` : ''}`),
  });
}
