import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { Table, TableCell, TableRow } from '../../components/Table';
import type { UserRole } from '../../types';
import { useAuthStore } from '../auth/authStore';

interface SeatUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Invited';
}

const SEAT_LIMIT = 10;
const SEARCH_LIMIT = 1_000;
const WATCH_LIMIT = 25;
const SEARCH_USAGE = 842;
const WATCH_USAGE = 18;

const initialUsers: SeatUser[] = [
  { id: 'u1', name: 'Jane Smith', email: 'admin@forgeglobal.com', role: 'admin', status: 'Active' },
  { id: 'u2', name: 'John Doe', email: 'attorney@forgeglobal.com', role: 'attorney', status: 'Active' },
  { id: 'u3', name: 'Robert Ross', email: 'viewer@forgeglobal.com', role: 'viewer', status: 'Active' },
  { id: 'u4', name: 'Amina Bello', email: 'amina@firm.com', role: 'attorney', status: 'Active' },
  { id: 'u5', name: 'Chidi Okafor', email: 'chidi@firm.com', role: 'attorney', status: 'Active' },
  { id: 'u6', name: 'Grace Mensah', email: 'grace@firm.com', role: 'viewer', status: 'Active' },
  { id: 'u7', name: 'Tunde Lawal', email: 'tunde@firm.com', role: 'attorney', status: 'Active' },
  { id: 'u8', name: 'Maya Cole', email: 'maya@firm.com', role: 'viewer', status: 'Invited' },
];

const roleStyles: Record<UserRole, string> = {
  admin: 'bg-forge-navy-950 text-white',
  attorney: 'bg-forge-teal-700 text-white',
  viewer: 'bg-forge-silver-300 text-text-primary',
};

function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={roleStyles[role]}>{role}</Badge>;
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = Math.round((used / limit) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold uppercase">
        <span>{label}</span>
        <span>{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-forge-silver-100"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className="h-full bg-forge-teal-700" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-text-secondary">{percent}% used this billing period</p>
    </div>
  );
}

export const AdminScreen: React.FC = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState(initialUsers);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('attorney');
  const [announcement, setAnnouncement] = useState('');
  const seatsAvailable = SEAT_LIMIT - users.length;
  const seatPercent = Math.round((users.length / SEAT_LIMIT) * 100);

  const recommendation = useMemo(() => {
    const peakUsage = Math.max(seatPercent, (SEARCH_USAGE / SEARCH_LIMIT) * 100, (WATCH_USAGE / WATCH_LIMIT) * 100);
    if (peakUsage >= 90) return 'Renew now and request a capacity increase before onboarding more users or watches.';
    if (peakUsage >= 80) return 'Renew the Enterprise plan and review higher search capacity before the next billing period.';
    return 'Renew the current Enterprise plan; present capacity should cover the next billing period.';
  }, [seatPercent]);

  const inviteUser = (event: React.FormEvent) => {
    event.preventDefault();
    if (seatsAvailable <= 0) return;

    setUsers((current) => [
      ...current,
      {
        id: `invited-${Date.now()}`,
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        status: 'Invited',
      },
    ]);
    setAnnouncement(`Invitation sent to ${inviteEmail.trim()} as ${inviteRole}.`);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('attorney');
    setIsInviteOpen(false);
  };

  const updateRole = (id: string, role: UserRole) => {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, role } : user));
    const changedUser = users.find((user) => user.id === id);
    setAnnouncement(`${changedUser?.name ?? 'User'} is now assigned the ${role} role.`);
  };

  const removeSeat = (id: string) => {
    const removedUser = users.find((user) => user.id === id);
    setUsers((current) => current.filter((user) => user.id !== id));
    setAnnouncement(`${removedUser?.name ?? 'User'} was removed and one seat is now available.`);
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Administration</h1>
          <p className="text-sm text-text-secondary">Firm-wide access, subscription, and renewal planning</p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)} disabled={seatsAvailable === 0}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          {seatsAvailable === 0 ? 'Seat limit reached' : 'Invite user'}
        </Button>
      </header>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div className={`flex items-start gap-3 rounded-lg border p-4 ${seatsAvailable === 0 ? 'border-risk-high bg-risk-high/10' : seatsAvailable <= 2 ? 'border-risk-medium bg-risk-medium/10' : 'border-forge-silver-300 bg-surface-card'}`}>
        {seatsAvailable === 0
          ? <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-risk-high" aria-hidden="true" />
          : <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-forge-teal-700" aria-hidden="true" />}
        <div>
          <p className="font-bold text-text-primary">
            {users.length} of {SEAT_LIMIT} seats used — {seatsAvailable === 0 ? 'no seats available' : `${seatsAvailable} available`}
          </p>
          <p className="text-sm text-text-secondary">
            {seatsAvailable === 0
              ? 'Remove a seat or increase the subscription limit before inviting another user.'
              : 'Invitations reserve a seat immediately and remain marked as invited until accepted.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Seat management">
            <Table headers={['Name', 'Role', 'Status', 'Actions']}>
              {users.map((user) => {
                const isCurrentUser = user.id === currentUser?.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-bold text-text-primary">{user.name}{isCurrentUser ? ' (you)' : ''}</div>
                      <div className="text-xs text-text-secondary">{user.email}</div>
                    </TableCell>
                    <TableCell><RoleBadge role={user.role} /></TableCell>
                    <TableCell>
                      <Badge tone={user.status === 'Active' ? 'success' : 'neutral'}>{user.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          onChange={(event) => updateRole(user.id, event.target.value as UserRole)}
                          disabled={isCurrentUser}
                          className="rounded border border-forge-silver-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="attorney">Attorney</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSeat(user.id)}
                          disabled={isCurrentUser}
                          aria-label={`Remove ${user.name}'s seat`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </Card>

          <Card title="Audit log">
            <div className="space-y-4">
              {[
                { action: 'Export generated', user: 'John Doe', time: '2 hours ago' },
                { action: 'Watch created: FORGE LABS', user: 'Jane Smith', time: '5 hours ago' },
                { action: 'User login', user: 'Robert Ross', time: '1 day ago' },
              ].map((log) => (
                <div key={`${log.action}-${log.time}`} className="flex items-center justify-between border-b border-forge-silver-100 py-2 text-sm last:border-0">
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-forge-silver-500" aria-hidden="true" />
                    <div>
                      <span className="font-bold text-text-primary">{log.action}</span>
                      <span className="ml-2 text-text-secondary">by {log.user}</span>
                    </div>
                  </div>
                  <span className="text-xs text-text-secondary">{log.time}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Subscription" className="border-none bg-forge-navy-950 text-white">
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-forge-subtext-onDark">Current plan</div>
                <div className="flex items-center gap-2 text-2xl font-black">
                  Enterprise <ShieldCheck className="h-6 w-6 text-forge-teal-600" aria-hidden="true" />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-forge-subtext-onDark">Renewal date</dt><dd className="font-bold">Oct 14, 2026</dd></div>
                <div><dt className="text-forge-subtext-onDark">Subscription</dt><dd className="font-bold">Active</dd></div>
                <div><dt className="text-forge-subtext-onDark">Payment</dt><dd className="flex items-center gap-1 font-bold"><CreditCard className="h-4 w-4" aria-hidden="true" /> Paid</dd></div>
                <div><dt className="text-forge-subtext-onDark">Seats</dt><dd className="font-bold">{users.length} / {SEAT_LIMIT}</dd></div>
              </dl>
              <Button className="w-full bg-accent hover:bg-accent-hover">Manage billing</Button>
            </div>
          </Card>

          <Card title="Usage summary">
            <div className="space-y-5">
              <UsageMeter label="Seats" used={users.length} limit={SEAT_LIMIT} />
              <UsageMeter label="Searches" used={SEARCH_USAGE} limit={SEARCH_LIMIT} />
              <UsageMeter label="Watches" used={WATCH_USAGE} limit={WATCH_LIMIT} />
            </div>
          </Card>

          <Card title="Renewal recommendation" className="border-forge-teal-700 bg-forge-teal-700/10">
            <p className="font-bold text-text-primary">Recommended: renew Enterprise</p>
            <p className="mt-2 text-sm text-text-secondary">{recommendation}</p>
            <p className="mt-3 text-xs text-text-secondary">Search usage is currently the leading capacity signal at 84%.</p>
          </Card>
        </div>
      </div>

      <div className="rounded border border-risk-medium bg-risk-medium/10 p-4 text-sm text-text-primary">
        <strong>Backend authorization required:</strong> navigation and route guards are client-side safeguards only. The API must validate Admin role, firm tenancy, subscription limits, and audit every invitation, role change, seat removal, billing action, and export.
      </div>

      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite a user"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
            <Button type="submit" form="invite-user-form">Send invitation</Button>
          </>
        )}
      >
        <form id="invite-user-form" className="space-y-4" onSubmit={inviteUser}>
          <p className="text-sm text-text-secondary">This invitation will reserve one of {seatsAvailable} available seats.</p>
          <div>
            <label htmlFor="invite-name" className="mb-1 block text-sm font-bold text-text-primary">Full name</label>
            <input
              id="invite-name"
              required
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            />
          </div>
          <div>
            <label htmlFor="invite-email" className="mb-1 block text-sm font-bold text-text-primary">Email address</label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1 block text-sm font-bold text-text-primary">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as UserRole)}
              className="w-full rounded border border-forge-silver-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              <option value="admin">Admin — manage seats and billing</option>
              <option value="attorney">Attorney — research and manage work</option>
              <option value="viewer">Viewer — read-only access</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
};
