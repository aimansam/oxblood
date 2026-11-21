import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-info/40 bg-info/10 text-info',
  neutral: 'border-border bg-muted text-muted-foreground',
};

const LEDS: Record<Tone, string> = {
  success: 'led-ok led-pulse',
  warning: 'led-warn',
  danger: 'led-danger',
  info: 'led-info',
  neutral: '',
};

/** Drill status -> label and tone. Unknown statuses render neutral instead of breaking. */
export function drillStatusTone(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Live', tone: 'success' };
    case 'scheduled':
      return { label: 'Scheduled', tone: 'warning' };
    case 'paused':
      return { label: 'Paused', tone: 'info' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    default:
      return { label: status || 'Unknown', tone: 'neutral' };
  }
}

export function StatusChip({ status }: { status: string }) {
  const { label, tone } = drillStatusTone(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider', TONES[tone])}>
      <span aria-hidden className={cn('led !h-1.5 !w-1.5', LEDS[tone])} />
      {label}
    </span>
  );
}
