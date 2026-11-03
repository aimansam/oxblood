import { cn } from '@/lib/utils';
import type { Filter } from './RangeMap';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['red', 'Threat path'],
  ['blue', 'Defense'],
  ['shared', 'VLAN links'],
];

const button = 'rounded border border-border bg-card/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground';

export function MapToolbar({
  operator,
  filter,
  onFilter,
  legend,
  onLegend,
  story,
  onStory,
  playing,
  onPlaying,
  onFit,
  onReveal,
  onZoom,
}: {
  operator: boolean;
  filter: Filter;
  onFilter: (f: Filter) => void;
  legend: boolean;
  onLegend: () => void;
  story: boolean;
  onStory: () => void;
  playing: boolean;
  onPlaying: () => void;
  onFit: () => void;
  onReveal: () => void;
  onZoom: (factor: number) => void;
}) {
  return (
    <div className="map-overlay absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-card/50 p-1.5 backdrop-blur" role="group" aria-label="Map controls">
        <button type="button" className={cn(button, 'max-sm:hidden')} onClick={onReveal}>
          Replay reveal
        </button>
        <button type="button" className={button} aria-label="Zoom in" onClick={() => onZoom(0.7)}>
          +
        </button>
        <button type="button" className={button} aria-label="Zoom out" onClick={() => onZoom(1.4)}>
          −
        </button>
        <button type="button" className={button} onClick={onFit}>
          Fit range
        </button>
        {operator && (
          <button type="button" className={button} aria-pressed={story} onClick={onStory}>
            Story feed
          </button>
        )}
        <button type="button" className={button} aria-pressed={legend} onClick={onLegend}>
          VLANs
        </button>
        <button type="button" className={cn(button, playing && 'border-primary text-foreground')} aria-pressed={playing} onClick={onPlaying}>
          {playing ? 'Pause flow' : 'Play flow'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-card/50 p-1.5 backdrop-blur" role="group" aria-label="Map layers">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" className={button} aria-pressed={filter === value} onClick={() => onFilter(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
