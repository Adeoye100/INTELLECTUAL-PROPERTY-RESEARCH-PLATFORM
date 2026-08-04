import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { AdminScreen } from './AdminScreen';

describe('AdminScreen seat management', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('admin-token', {
      id: 'u1',
      email: 'admin@forgeglobal.com',
      fullName: 'Jane Smith',
      role: 'admin',
    });
  });

  afterEach(() => {
    act(() => useAuthStore.getState().clearSession());
    localStorage.clear();
  });

  it('supports keyboard invitation, role assignment, and seat removal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminScreen /></MemoryRouter>);

    const inviteButton = screen.getByRole('button', { name: 'Invite user' });
    inviteButton.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog', { name: 'Invite a user' });
    expect(dialog).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close Invite a user' })).toHaveFocus();

    await user.tab();
    const nameInput = screen.getByRole('textbox', { name: 'Full name' });
    expect(nameInput).toHaveFocus();
    fireEvent.change(nameInput, { target: { value: 'Lola Reed' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'lola@firm.com' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'viewer' } });
    screen.getByRole('button', { name: 'Send invitation' }).focus();
    await user.keyboard('{Enter}');

    const invitedRow = screen.getByText('Lola Reed').closest('tr');
    expect(invitedRow).not.toBeNull();
    expect(within(invitedRow!).getByText('viewer')).toBeVisible();
    expect(within(invitedRow!).getByText('Invited')).toBeVisible();
    expect(screen.getByText(/9 of 10 seats used/i)).toBeVisible();

    fireEvent.change(within(invitedRow!).getByRole('combobox', { name: 'Role for Lola Reed' }), { target: { value: 'attorney' } });
    expect(within(invitedRow!).getByText('attorney')).toBeVisible();

    fireEvent.click(within(invitedRow!).getByRole('button', { name: "Remove Lola Reed's seat" }));
    expect(screen.queryByText('Lola Reed')).not.toBeInTheDocument();
    expect(screen.getByText(/8 of 10 seats used/i)).toBeVisible();
  }, 20_000);

  it('returns focus to the invitation trigger when Escape closes the modal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminScreen /></MemoryRouter>);
    const inviteButton = screen.getByRole('button', { name: 'Invite user' });

    await user.click(inviteButton);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(inviteButton).toHaveFocus();
  }, 20_000);
});
