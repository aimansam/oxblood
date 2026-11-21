import { BarChart3, Building2, FileText, Gauge, LayoutDashboard, LogOut, Menu, Moon, Radar, Server, Settings, Sun, Swords, Users, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMe } from '@/api/hooks';
import { setToken } from '@/api/token';
import { Wordmark, BrandMark } from '@/components/BrandMark';
import { StatusBar } from '@/components/StatusBar';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

// Short nouns on purpose.
const NAV: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard, to: '/' },
  { label: 'Exercises', icon: Swords, to: '/exercises' },
  { label: 'Mission Control', icon: Radar, to: '/mission-control' },
  { label: 'Organizations', icon: Building2, to: '/organizations' },
  { label: 'Players', icon: Users, to: '/players' },
  { label: 'Competition', icon: BarChart3, to: '/competition' },
  { label: 'Infrastructure', icon: Server, to: '/infrastructure' },
  { label: 'Scoreboard', icon: Gauge, to: '/scoreboard' },
  { label: 'Reports', icon: FileText, to: '/reports' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

const linkClass = 'group relative flex items-center gap-3 rounded-sm px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) => cn(linkClass, isActive && 'bg-muted text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-primary before:shadow-[0_0_8px_hsl(var(--primary))]')}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [theme, toggleTheme] = useTheme();

  const signOut = () => {
    setToken(null);
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2 px-3 pt-1">
        <Wordmark compact />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      <Nav onNavigate={() => setOpen(false)} />
      <div className="mt-auto flex items-center gap-3 border-t border-border px-3 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-muted font-mono text-xs font-semibold uppercase">
          {me?.sub.slice(0, 2) ?? '··'}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-medium">{me?.sub ?? 'Signed in'}</div>
          <div className="hud-label truncate">{me?.role}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card/40 md:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-background">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-border px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <BrandMark />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.18em]">OxBlood</span>
        </header>
        <StatusBar operator />
        <main className="bg-grid flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
