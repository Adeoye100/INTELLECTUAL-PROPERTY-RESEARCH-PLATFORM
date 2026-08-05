import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignupScreen } from './SignupScreen';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const renderSignup = () => render(
  <MemoryRouter initialEntries={['/auth/signup']}>
    <Routes><Route path="/auth/signup" element={<SignupScreen />} /></Routes>
  </MemoryRouter>,
);

async function completeSignupForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Ada Counsel');
  await user.type(screen.getByRole('textbox', { name: 'Company or firm' }), 'Forge Legal');
  await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'ada@example.test');
  await user.type(screen.getByLabelText('Password'), 'safe-password');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SignupScreen', () => {
  it('submits the account request and advances to email verification', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true, verificationRequired: true }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    const submit = screen.getByRole('button', { name: 'Request access' });
    submit.focus();
    await user.keyboard('{Enter}');

    const success = await screen.findByRole('status');
    await waitFor(() => expect(success).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    expect(screen.getByText(/verification link to ada@example\.test/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'View verification options' })).toHaveAttribute('href', '/auth/verify-email?email=ada%40example.test');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      fullName: 'Ada Counsel',
      company: 'Forge Legal',
      email: 'ada@example.test',
      password: 'safe-password',
    });
  }, 20_000);

  it('shows the duplicate-account recovery state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'DUPLICATE_ACCOUNT',
      message: 'Account already exists.',
    }, 409)));
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Request access' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/account already exists for this email address/i);
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login');
    expect(within(alert).getByRole('link', { name: 'Reset password' })).toHaveAttribute('href', '/auth/forgot-password');
  }, 20_000);

  it('exposes accessible validation errors in keyboard order', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = renderSignup();

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    screen.getByRole('button', { name: 'Request access' }).focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Enter your full name.')).toHaveAttribute('id', 'signup-fullName-error');
    expect(screen.getByText('Enter your company or firm name.')).toHaveAttribute('id', 'signup-company-error');
    expect(screen.getByText('Enter a valid email address.')).toHaveAttribute('id', 'signup-email-error');
    expect(screen.getByText('Password must be at least 8 characters.')).toHaveAttribute('id', 'signup-password-error');
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveAttribute('aria-describedby', 'signup-fullName-error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);
});
