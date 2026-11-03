import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function ReadinessDialog({ drillId, open, onOpenChange }: { drillId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ['range-health', drillId], enabled: open, queryFn: async () => unwrap(await api.GET('/api/v2/drills/{drill_id}/range-health', { params: { path: { drill_id: drillId } } })), staleTime: 0 });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Range readiness</DialogTitle></DialogHeader>
        <DialogBody>
          {q.isLoading || q.isFetching ? <p className="text-muted-foreground">Checking range…</p> : q.isError ? <p className="text-danger">{(q.error as Error).message || 'Readiness checks unavailable.'}</p> : (
            <>
              <p className="mb-3 text-muted-foreground">{q.data?.summary}</p>
              <ul className="divide-y divide-border">
                {(q.data?.checks ?? []).map((c, i) => (
                  <li key={i} className="py-2">
                    <div className="flex justify-between gap-3"><strong>{c.label}</strong><span className={c.state === 'ready' ? 'text-success' : 'text-warning'}>{c.state.replace(/_/g, ' ')}{c.required ? '' : ' (informational)'}</span></div>
                    {c.detail && <p className="text-xs text-muted-foreground">{c.detail}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => q.refetch()}>Recheck</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
