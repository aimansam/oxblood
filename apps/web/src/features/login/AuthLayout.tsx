import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@/components/BrandMark';

const BOOT = [
  ['ok', 'range controller online'],
  ['ok', 'scenario catalog synced'],
  ['ok', 'scoring ledger armed'],
  ['wait', 'awaiting operator credentials'],
] as const;

/** Sign-in frame: a brand panel on the left (decorative), the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <aside aria-hidden className="bg-grid relative hidden flex-col justify-between border-r border-border bg-card/40 p-10 lg:flex">
        <Wordmark />
        <div>
          <BrandMark className="mb-6 h-14 w-14" />
          <p className="hud-label !text-primary">{'//'} cyber range</p>
          <p className="mt-2 max-w-sm text-2xl font-semibold leading-snug tracking-tight">Red versus blue, on infrastructure you can break.</p>
          <ul className="mt-8 space-y-1.5 font-mono text-xs text-muted-foreground">
            {BOOT.map(([state, line]) => (
              <li key={line} className="flex items-center gap-2">
                <span className={state === 'ok' ? 'text-success' : 'text-warning'}>{state === 'ok' ? '[ ok ]' : '[ .. ]'}</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="hud-label">Exercise environment · simulated targets only</p>
      </aside>
      <div className="bg-grid flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
