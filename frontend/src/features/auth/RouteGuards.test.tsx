import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { MainLayout } from '../../app/MainLayout';
import type { UserRole } from '../../types';
import { RequireAdmin, RequireAuthentication, RequireRole, RoleHomeRedirect } from './RouteGuards';
import { useAuthStore } from './authStore';

const setRole = (role: UserRole) => {
  useAuthStore.getState().setSession('test-token', {
    id: 'u1',
    email: `${role}@forgeglobal.com`,
    fullName: `${role} user`,
    role,
    firmId: 'firm-1',
  });
};

afterEach(() => {
  act(() => useAuthStore.getState().clearSession());
  localStorage.clear();
});

describe('role access', () => {
  it.each(['attorney', 'viewer'] as const)('redirects %s users away from /admin', (role) => {
    setRole(role);
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/permission-denied" element={<div>Permission denied destination</div>} />
          <Route
            path="/admin"
            element={(
              <RequireAdmin>
                <div>Administration content</div>
              </RequireAdmin>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Permission denied destination')).toBeVisible();
    expect(screen.queryByText('Administration content')).not.toBeInTheDocument();
  });

  it('allows Admin users to open /admin', () => {
    setRole('admin');
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <RequireAdmin><div>Administration content</div></RequireAdmin>
      </MemoryRouter>,
    );

    expect(screen.getByText('Administration content')).toBeVisible();
  });

  it.each(['admin', 'attorney', 'viewer'] as const)('does not expose disabled administration navigation for %s', (role) => {
    setRole(role);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="dashboard" element={<div>Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it.each([
    ['admin', 'Dashboard home'],
    ['attorney', 'Dashboard home'],
    ['viewer', 'Dashboard home'],
  ] as const)('routes %s to its role-aware home', (role, destination) => {
    setRole(role);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<RoleHomeRedirect />} />
          <Route path="/dashboard" element={<div>Dashboard home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(destination)).toBeVisible();
  });

  it('blocks Viewer users from Attorney-only routes', () => {
    setRole('viewer');
    render(
      <MemoryRouter initialEntries={['/office-actions']}>
        <Routes>
          <Route path="/permission-denied" element={<div>Permission denied destination</div>} />
          <Route path="/office-actions" element={<RequireRole allowedRoles={['admin', 'attorney']}><div>Office Actions</div></RequireRole>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Permission denied destination')).toBeVisible();
  });

  it('redirects an unauthenticated Supabase state from a protected route', () => {
    useAuthStore.getState().clearSession();
    render(
      <MemoryRouter initialEntries={['/search']}>
        <Routes>
          <Route path="/auth/login" element={<div>Sign-in destination</div>} />
          <Route path="/search" element={<RequireAuthentication><div>Protected search</div></RequireAuthentication>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Sign-in destination')).toBeVisible();
  });
});
