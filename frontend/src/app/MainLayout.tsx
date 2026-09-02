import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { 
  LayoutDashboard, 
  LogOut,
  Users,
  BriefcaseBusiness,
  CreditCard
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';
import { useAuthStore } from '../features/auth/authStore';
import { authRequest } from '../features/auth/authApi';
import { SessionExpiryMonitor } from '../features/auth/SessionExpiryMonitor';
import { appQueryClient } from '../lib/queryClient';
import { navigationForRole } from '../features/auth/capabilities';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const initials = user?.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? 'FG';
  const roleLabel = user?.role ? `${user.role[0].toUpperCase()}${user.role.slice(1)}` : '';

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
    <div className="flex flex-col min-h-screen">
      <SessionExpiryMonitor />
      <a href="#main-content" className="sr-only z-[70] rounded bg-white px-4 py-2 text-forge-navy-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      {/* Header */}
      <header className="h-16 bg-forge-gradient flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
        <Logo />
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-2 border-l border-white/20 pl-4">
            <div className="w-8 h-8 rounded-full bg-forge-teal-700 flex items-center justify-center font-bold text-sm">
              {initials}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold leading-none">{user?.fullName}</p>
              <p className="text-[10px] text-forge-subtext-onDark">{roleLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-20 xl:w-64 bg-forge-navy-800 text-white flex flex-col sticky top-16 h-[calc(100vh-64px)] overflow-y-auto transition-[width]">
          <nav className="flex-1 p-3 xl:p-4 space-y-1" aria-label="Application">
            {navigationForRole(user?.role).map((item) => (
              <NavItem key={item.to} to={item.to} icon={item.to === '/dashboard' ? <LayoutDashboard size={20} /> : item.to === '/portfolio' ? <BriefcaseBusiness size={20} /> : item.to === '/admin/billing' ? <CreditCard size={20} /> : <Users size={20} />} label={item.label} />
            ))}
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full justify-center xl:justify-start text-white hover:bg-white/10"
              size="sm"
              onClick={signOut}
            >
              <LogOut size={18} className="xl:mr-2" aria-hidden="true" />
              <span className="sr-only xl:not-sr-only">Sign Out</span>
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 bg-surface-base p-4 md:p-6 xl:p-8 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center justify-center xl:justify-start gap-3 px-3 py-2 rounded transition-colors',
          isActive 
            ? 'bg-forge-teal-700 text-white font-semibold' 
            : 'text-forge-subtext-onDark hover:bg-white/5 hover:text-white'
        )
      }
    >
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only xl:not-sr-only">{label}</span>
    </NavLink>
  );
};
