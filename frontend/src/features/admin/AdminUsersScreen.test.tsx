import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersScreen } from './AdminUsersScreen';

describe('AdminUsersScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes an active member through the canonical Admin API and preserves inactive history in the list', async () => {
    let removed = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/admin/users') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          users: [{
            id: '11111111-1111-4111-8111-111111111111',
            email: 'member@example.test',
            role: 'attorney',
            status: removed ? 'inactive' : 'active',
            lastLoginAt: null,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/admin/invitations')) {
        return new Response(JSON.stringify({ invitations: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/admin/users/11111111-1111-4111-8111-111111111111') && init?.method === 'DELETE') {
        removed = true;
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Unexpected test request.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminUsersScreen />);
    const membersTable = await screen.findByRole('table');
    expect(within(membersTable).getByText('member@example.test')).toBeVisible();

    fireEvent.click(within(membersTable).getByRole('button', { name: 'Remove access' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => (
        String(input).endsWith('/api/v1/admin/users/11111111-1111-4111-8111-111111111111')
        && init?.method === 'DELETE'
      ))).toBe(true);
    });
    await waitFor(() => expect(within(membersTable).getByText('Access removed')).toBeVisible());
    expect(within(membersTable).getByRole('combobox', { name: 'Role for member@example.test' })).toBeDisabled();
  });

  it('does not remove access when the Admin cancels the confirmation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/v1/admin/users')
        ? { users: [{ id: '11111111-1111-4111-8111-111111111111', email: 'member@example.test', role: 'viewer', status: 'active', lastLoginAt: null }] }
        : { invitations: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdminUsersScreen />);
    const membersTable = await screen.findByRole('table');
    expect(within(membersTable).getByText('member@example.test')).toBeVisible();
    fireEvent.click(within(membersTable).getByRole('button', { name: 'Remove access' }));

    await act(async () => {});
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });
});
