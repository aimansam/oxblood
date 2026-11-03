import { Layers, Maximize2, Pause, Play, ScrollText, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Filter } from './RangeMap';

const LAYERS: [Filter, string][] = [
  ['all', 'All'],
  ['red', 'Threat path'],
  ['blue', 'Defense'],
  ['shared', 'VLAN links'],
];

const tool = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const group = 'flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-1 shadow-sm backdrop-blur';

/** One slim toolbar: view tools as icon buttons, layers as a segmented control. */
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
    <div className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
      <div className={group} role="group" aria-label="Map layers">
        {LAYERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={cn('rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            onClick={() => onFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={group} role="group" aria-label="Map tools">
        <button type="button" className={tool} aria-label="Zoom in" title="Zoom in" onClick={() => onZoom(0.7)}>
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="Zoom out" title="Zoom out" onClick={() => onZoom(1.4)}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="Fit range" title="Fit range" onClick={onFit}>
          <Maximize2 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button type="button" className={tool} aria-label={playing ? 'Pause flow' : 'Play flow'} title={playing ? 'Pause flow' : 'Play flow'} aria-pressed={playing} onClick={onPlaying}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" className={tool} aria-label="VLANs" title="VLANs" aria-pressed={legend} onClick={onLegend}>
          <Layers className="h-4 w-4" />
        </button>
        {operator && (
          <button type="button" className={tool} aria-label="Story feed" title="Story feed" aria-pressed={story} onClick={onStory}>
            <ScrollText className="h-4 w-4" />
          </button>
        )}
        <button type="button" className={cn(tool, 'max-sm:hidden')} aria-label="Replay reveal" title="Replay reveal" onClick={onReveal}>
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
