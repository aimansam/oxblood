import { LogOut, Moon, Sun } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useMe } from '@/api/hooks';
import { setToken } from '@/api/token';
import { Wordmark } from '@/components/BrandMark';
import { StatusBar } from '@/components/StatusBar';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** Players get no navigation: one mission screen and the live map. */
export function ParticipantShell() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [theme, toggleTheme] = useTheme();
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <Wordmark />
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {me?.sub}{' '}
            <span className={cn('hud-label rounded-sm border px-1.5 py-0.5', me?.role === 'red' ? 'border-danger/50 !text-danger' : me?.role === 'blue' ? 'border-info/50 !text-info' : 'border-border')}>· {me?.role}</span>
          </span>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => { setToken(null); navigate('/login', { replace: true }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <StatusBar operator={false} />
      <main className="bg-grid flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
