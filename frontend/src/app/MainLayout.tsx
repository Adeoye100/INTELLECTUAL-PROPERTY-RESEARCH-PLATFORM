import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import {
  LayoutDashboard,
  LogOut,
  Users,
  BriefcaseBusiness,
  CreditCard,
  Search as SearchIcon,
  FileText,
  Eye,
  Menu,
  X,
  Activity,
  BarChart3,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuthStore } from '../features/auth/authStore';
import { authRequest } from '../features/auth/authApi';
import { SessionExpiryMonitor } from '../features/auth/SessionExpiryMonitor';
import { appQueryClient } from '../lib/queryClient';
import { navigationForRole } from '../features/auth/capabilities';
import { useRuntimeCapabilities } from '../features/system/runtimeCapabilities';

function getNavIcon(path: string) {
  switch (path) {
    case '/dashboard':
      return <LayoutDashboard size={20} />;
    case '/search':
      return <SearchIcon size={20} />;
    case '/risk-analysis':
      return <Activity size={20} />;
    case '/office-actions':
      return <FileText size={20} />;
    case '/portfolio':
      return <BriefcaseBusiness size={20} />;
    case '/watches':
      return <Eye size={20} />;
    case '/reports':
      return <BarChart3 size={20} />;
    case '/admin/billing':
      return <CreditCard size={20} />;
    default:
      return <Users size={20} />;
  }
}

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const runtime = useRuntimeCapabilities();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const initials = user?.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? 'FG';
  const roleLabel = user?.role ? `${user.role[0].toUpperCase()}${user.role.slice(1)}` : '';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const signOut = async () => {
    try {
      await authRequest<void>('/auth/logout', { method: 'POST' });
    } catch {
      // Local logout must still succeed when server revocation is unavailable.
    } finally {
      appQueryClient.clear();
      clearSession();
      navigate('/auth/login', { replace: true, state: { reason: 'signed-out' } });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SessionExpiryMonitor />
      <a
        href="#main-content"
        className="sr-only z-[70] rounded bg-card px-4 py-2 text-card-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-forge-gradient px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded p-1 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            aria-controls="application-sidebar"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Logo />
        </div>

        <div className="flex items-center gap-3 text-white">
          <ThemeToggle surface="app" />
          <div className="flex items-center gap-2 border-l border-white/20 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-teal-700 text-sm font-bold">
              {initials}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold leading-none">{user?.fullName}</p>
              <p className="text-[10px] text-forge-subtext-onDark">{roleLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 top-16 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <aside
          id="application-sidebar"
          className={cn(
            'fixed bottom-0 left-0 top-16 z-50 flex w-72 flex-col',
            'bg-forge-navy-800 text-white',
            'transition-transform duration-200',
            'lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] lg:w-64',
            'lg:translate-x-0',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Application">
            {navigationForRole(user?.role).map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                icon={getNavIcon(item.to)}
                label={item.label}
                onClick={() => setMobileNavOpen(false)}
              />
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <Button
              variant="ghost"
              className="w-full justify-start text-white hover:bg-white/10"
              size="sm"
              onClick={signOut}
            >
              <LogOut size={18} className="mr-2" aria-hidden="true" />
              <span>Sign Out</span>
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-background text-foreground">
          {runtime.data?.readOnly && (
            <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm md:px-6 xl:px-8" role="status">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                <strong>Research demo mode:</strong> Search and read-only research remain available. Changes to portfolio, watches, invitations, reports and billing are paused until the production database is writable.
              </p>
            </div>
          )}
          <main id="main-content" tabIndex={-1} className="min-w-0 p-4 focus:outline-none md:p-6 xl:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, onClick }) => {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded px-3 py-2 transition-colors',
          isActive
            ? 'bg-forge-teal-700 font-semibold text-white'
            : 'text-forge-subtext-onDark hover:bg-white/5 hover:text-white',
        )
      }
    >
      <span aria-hidden="true">{icon}</span>
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};
