import { useParams } from 'react-router-dom';
import { useDrills, useMe } from '@/api/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { LiveRangeReact } from './LiveRangeReact';

/** Route component for /live/:id. */
export function ThreatMapPage() {
  const { id } = useParams();
  const drills = useDrills();
  const me = useMe();
  const drill = drills.data?.find((d) => String(d.id) === id);
  if (drills.isLoading || me.isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!drill || !me.data) return <div className="p-8 text-muted-foreground">Exercise not found.</div>;
  return <LiveRangeReact drill={drill} user={me.data} />;
}
