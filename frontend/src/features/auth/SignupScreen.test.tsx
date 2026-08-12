import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignupScreen } from './SignupScreen';

const auth = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

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
  auth.signUp.mockReset();
});

describe('SignupScreen', () => {
  it('creates the Supabase identity, provisions the firm, and advances to verification', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true }, 201));
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
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ada@example.test',
      password: 'safe-password',
      options: expect.objectContaining({ data: expect.objectContaining({ full_name: 'Ada Counsel' }) }),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      fullName: 'Ada Counsel', company: 'Forge Legal', email: 'ada@example.test', password: 'safe-password',
    });
  }, 20_000);

  it('shows the duplicate-account recovery state from Supabase', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'Already registered' } });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Request access' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/account already exists for this email address/i);
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login');
    expect(fetchMock).toHaveBeenCalledOnce();
  }, 20_000);

  it('exposes accessible validation errors in keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = renderSignup();

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    screen.getByRole('button', { name: 'Request access' }).focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Enter your full name.')).toHaveAttribute('id', 'signup-fullName-error');
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveAttribute('aria-describedby', 'signup-fullName-error');
    expect(auth.signUp).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);
});
