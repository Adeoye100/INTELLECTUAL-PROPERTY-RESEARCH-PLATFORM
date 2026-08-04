import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { MainLayout } from '../../app/MainLayout';
import type { UserRole } from '../../types';
import { RequireAdmin } from './RouteGuards';
import { useAuthStore } from './authStore';

const setRole = (role: UserRole) => {
  useAuthStore.getState().setSession('test-token', {
    id: 'u1',
    email: `${role}@forgeglobal.com`,
    fullName: `${role} user`,
    role,
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
          <Route path="/dashboard" element={<div>Dashboard destination</div>} />
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

    expect(screen.getByText('Dashboard destination')).toBeVisible();
    expect(screen.queryByText('Administration content')).not.toBeInTheDocument();
  });

  it('allows Admin users to open /admin and persists their role', () => {
    setRole('admin');
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <RequireAdmin><div>Administration content</div></RequireAdmin>
      </MemoryRouter>,
    );

    expect(screen.getByText('Administration content')).toBeVisible();
    expect(localStorage.getItem('forge-auth-session')).toContain('"role":"admin"');
  });

  it.each([
    ['admin', true],
    ['attorney', false],
    ['viewer', false],
  ] as const)('shows Administration navigation for %s: %s', (role, expected) => {
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

    const administrationLink = screen.queryByRole('link', { name: 'Administration' });
    if (expected) expect(administrationLink).toBeVisible();
    else expect(administrationLink).not.toBeInTheDocument();
  });
});
