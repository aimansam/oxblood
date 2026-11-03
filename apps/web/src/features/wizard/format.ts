import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';

export interface Format {
  mode: 'free' | 'team';
  teams: number;
  rounds: number;
  layout: 'shared' | 'separate';
  /** Destroy the accounts made for this exercise once its range is cleaned up (the default). */
  destroyAccounts: boolean;
}

export const DEFAULT_FORMAT: Format = { mode: 'free', teams: 4, rounds: 2, layout: 'shared', destroyAccounts: true };

const GIB = 1024 ** 3;

/** The range copies a format asks for: one per match when matches are separate, otherwise one. */
export const copiesOf = (f: Format) => (f.mode === 'team' && f.layout === 'separate' ? Math.max(1, f.teams / 2) : 1);

export interface MemoryEstimate {
  copies: number;
  perCopyGiB: number;
  totalGiB: number;
  availableGiB: number | null;
  fits: boolean | null;
}

/** What the range needs against what the node has free, from the same check Prepare enforces. */
export function memoryEstimate(checks: { id?: string | null; [k: string]: unknown }[] | undefined, copies: number): MemoryEstimate | null {
  const check = (checks ?? []).find((c) => c.id === 'memory');
  const required = Number(check?.required_bytes ?? 0);
  if (!check || !required) return null;
  const available = check.available_bytes == null ? null : Number(check.available_bytes);
  const total = required * copies;
  return { copies, perCopyGiB: required / GIB, totalGiB: total / GIB, availableGiB: available == null ? null : available / GIB, fits: available == null ? null : total <= available };
}

/** The scenario's preflight, fetched as soon as a scenario is chosen (the Format step needs it before Setup). */
export function useScenarioPreflight(scenarioId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['scenario-preflight', scenarioId],
    enabled: enabled && scenarioId !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => unwrap(await api.GET('/api/v2/drills/scenario-preflight/{scenario_id}', { params: { path: { scenario_id: scenarioId as number } } })),
  });
}
