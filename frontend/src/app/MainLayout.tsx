import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { 
  Search, 
  Briefcase, 
  Eye, 
  Settings, 
  LayoutDashboard, 
  LogOut,
  Bell
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/Button';
import { useAuthStore } from '../features/auth/authStore';
import { authRequest } from '../features/auth/authApi';
import { SessionExpiryMonitor } from '../features/auth/SessionExpiryMonitor';

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
      clearSession();
      navigate('/auth/login', { replace: true, state: { reason: 'signed-out' } });
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <SessionExpiryMonitor />
      {/* Header */}
      <header className="h-16 bg-forge-gradient flex items-center justify-between px-6 sticky top-0 z-40">
        <Logo />
        <div className="flex items-center gap-4 text-white">
          <button
            className="p-2 hover:bg-white/10 rounded-full relative"
            aria-label="Notifications — alerts pending"
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-risk-high rounded-full border border-forge-navy-950" aria-hidden="true"></span>
            <span className="sr-only">You have pending alerts</span>
          </button>
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
        <aside className="w-64 bg-forge-navy-800 text-white flex flex-col sticky top-16 h-[calc(100vh-64px)] overflow-y-auto">
          <nav className="flex-1 p-4 space-y-1">
            <NavItem to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />
            <NavItem to="/search" icon={<Search size={20} />} label="Trademark Search" />
            <NavItem to="/portfolio" icon={<Briefcase size={20} />} label="Portfolio" />
            <NavItem to="/watches" icon={<Eye size={20} />} label="Watch Lists" />
            {user?.role === 'admin' && (
              <NavItem to="/admin" icon={<Settings size={20} />} label="Administration" />
            )}
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full justify-start text-white hover:bg-white/10"
              size="sm"
              onClick={signOut}
            >
              <LogOut size={18} className="mr-2" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1 bg-surface-base p-8">
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
          'flex items-center gap-3 px-3 py-2 rounded transition-colors',
          isActive 
            ? 'bg-forge-teal-700 text-white font-semibold' 
            : 'text-forge-subtext-onDark hover:bg-white/5 hover:text-white'
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
};
