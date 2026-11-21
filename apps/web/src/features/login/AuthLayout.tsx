import type { ReactNode } from 'react';
import { Wordmark } from '@/components/BrandMark';

/** Sign-in frame: a bold crimson panel on the left (decorative), the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full bg-muted/40 lg:grid-cols-[1.1fr_1fr]">
      <aside aria-hidden className="hidden flex-col justify-between bg-primary p-12 text-white lg:flex">
        <Wordmark inverse className="text-white" />
        <div>
          <p className="max-w-md text-6xl font-extrabold leading-[1.02] tracking-tight">Red versus blue. Break things on purpose.</p>
          <p className="mt-6 max-w-sm text-lg text-white/80">A cyber range for live attack and defence exercises, scored as they happen.</p>
        </div>
        <p className="text-sm font-medium text-white/70">Exercise environment · simulated targets only</p>
      </aside>
      <div className="flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
