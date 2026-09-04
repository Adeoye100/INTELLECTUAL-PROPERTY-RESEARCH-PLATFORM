import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  await user.type(screen.getByRole('textbox', { name: 'Firm name' }), 'Forge Legal');
  await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'ada@example.test');
  await user.type(screen.getByLabelText('Password'), 'safe-password');
}

beforeEach(() => {
  vi.stubEnv('VITE_PUBLIC_FIRM_SIGNUP_ENABLED', 'true');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  auth.signUp.mockReset();
});

describe('SignupScreen', () => {
  it('creates the Supabase identity and advances to verification when confirmation defers the session', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' })).mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    const submit = screen.getByRole('button', { name: 'Create organization' });
    submit.focus();
    await user.keyboard('{Enter}');

    const success = await screen.findByRole('status');
    await waitFor(() => expect(success).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ada@example.test',
      password: 'safe-password',
      options: expect.objectContaining({ data: expect.objectContaining({
        full_name: 'Ada Counsel', forge_signup_firm_name: 'Forge Legal',
      }) }),
    }));
    expect(fetchMock).toHaveBeenCalledOnce();
  }, 20_000);

  it('provisions the firm with the returned access token before entering the app', async () => {
    auth.signUp.mockResolvedValue({
      data: {
        user: { id: '11111111-1111-4111-8111-111111111111', identities: [{}] },
        session: {
          access_token: 'verified-signup-token',
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'ada@example.test',
            email_confirmed_at: '2026-08-12T00:00:00Z',
            app_metadata: {},
            user_metadata: {
              full_name: 'Ada Counsel',
              onboarding_required: true,
              forge_signup_firm_name: 'Forge Legal',
            },
          },
        },
      },
      error: null,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' }))
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'local-user', firmId: 'firm-1', email: 'ada@example.test', role: 'admin' },
        firm: { id: 'firm-1', name: 'Forge Legal', subscriptionTier: 'free' },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        userId: '11111111-1111-4111-8111-111111111111', email: 'ada@example.test', role: 'admin', firmId: 'firm-1',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/auth/signup']}>
        <Routes>
          <Route path="/auth/signup" element={<SignupScreen />} />
          <Route path="/admin/users" element={<h1>Organization administration</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await completeSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByRole('heading', { name: 'Organization administration' })).toBeVisible();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/provisioning/organization-intents');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/provisioning/firm');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer verified-signup-token');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ intentToken: 'intent-token' });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/me');
  }, 20_000);

  it('reports a conflicting firm without sending the password to the backend', async () => {
    auth.signUp.mockResolvedValue({
      data: {
        user: { id: '22222222-2222-4222-8222-222222222222', identities: [{}] },
        session: {
          access_token: 'verified-conflict-token',
          user: {
            id: '22222222-2222-4222-8222-222222222222', email: 'ada@example.test',
            email_confirmed_at: '2026-08-12T00:00:00Z', app_metadata: {},
            user_metadata: { full_name: 'Ada Counsel', forge_signup_firm_name: 'Forge Legal' },
          },
        },
      },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' })).mockResolvedValueOnce(jsonResponse({
      code: 'FIRM_ALREADY_EXISTS',
      message: 'This firm may already exist. Request an invitation from your firm administrator.',
    }, 409));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/request an invitation from your firm administrator/i);
    expect(alert).not.toHaveTextContent(/reset password/i);
    expect(String(fetchMock.mock.calls[1][1]?.body)).not.toContain('safe-password');
  }, 20_000);

  it('shows the duplicate-account recovery state from Supabase', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'Already registered' } });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' })).mockResolvedValueOnce(jsonResponse({ intentToken: 'intent-token', expiresAt: '2026-12-31T23:59:59.000Z' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSignup();

    await completeSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/account already exists for this email address/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  }, 20_000);

  it('exposes accessible validation errors in keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = renderSignup();

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveFocus();
    screen.getByRole('button', { name: 'Create organization' }).focus();
    await user.keyboard('{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Enter your name, organization name, valid email address, and a password of at least eight characters.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(auth.signUp).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);
});
