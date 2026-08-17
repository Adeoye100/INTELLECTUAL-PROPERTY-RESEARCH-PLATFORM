import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../features/auth/authStore';
import { MainLayout } from './MainLayout';

afterEach(() => useAuthStore.getState().clearSession());

describe('MainLayout', () => {
  it('provides keyboard landmarks and tablet/desktop shell breakpoints', async () => {
    useAuthStore.getState().setSession('token', { id: 'u1', email: 'user@example.test', fullName: 'Case User', role: 'attorney', firmId: 'firm-1' });
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes><Route element={<MainLayout />}><Route path="dashboard" element={<h1>Dashboard content</h1>} /></Route></Routes>
      </MemoryRouter>,
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute('href', '/watches');
    expect(container.querySelector('aside')).toHaveClass('w-20', 'xl:w-64');
    expect(container.querySelector('main')).toHaveClass('p-4', 'md:p-6', 'xl:p-8');
  });
});
