import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { getApiClient } from '../../lib/api/client';
import type { UserRole } from '../../types';

interface Member { id: string; email: string; role: UserRole; status: string; lastLoginAt: string | null; }
interface Invitation { id: string; email: string; intendedName: string; role: UserRole; issuerEmail: string | null; expiresAt: string; status: string; }
const roleDescriptions: Record<UserRole, string> = { admin: 'Manages firm members and settings.', attorney: 'Performs firm legal and research work.', viewer: 'Read-only access to firm information.' };

export function AdminUsersScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [users, pending] = await Promise.all([
        getApiClient().requestJson<{ users: Member[] }>('/admin/users'),
        getApiClient().requestJson<{ invitations: Invitation[] }>('/admin/invitations'),
      ]);
      setMembers(users.users); setInvitations(pending.invitations);
    } catch { setError('Users and invitations could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await getApiClient().requestJson('/admin/invitations', { method: 'POST', body: { fullName, email, role } });
      setFullName(''); setEmail(''); setRole('viewer'); setNotice('Invitation sent. The recipient will receive a secure acceptance link.');
      await load();
    } catch { setError('The invitation could not be sent. Check the details and try again.'); }
    finally { setSaving(false); }
  };
  const changeRole = async (member: Member, nextRole: UserRole) => {
    setError(null); setNotice(null);
    try { await getApiClient().requestJson(`/admin/users/${member.id}/role`, { method: 'PATCH', body: { role: nextRole } }); setNotice('Member role updated.'); await load(); }
    catch { setError('The role could not be changed. The final active Admin cannot be demoted and users cannot change their own role.'); }
  };
  const resend = async (id: string) => { try { await getApiClient().requestJson(`/admin/invitations/${id}/resend`, { method: 'POST' }); setNotice('A new invitation link was sent; the prior link is no longer valid.'); await load(); } catch { setError('The invitation could not be resent.'); } };
  const revoke = async (id: string) => { if (!window.confirm('Revoke this pending invitation? This cannot be undone.')) return; try { await getApiClient().requestJson(`/admin/invitations/${id}`, { method: 'DELETE' }); setNotice('Invitation revoked.'); await load(); } catch { setError('The invitation could not be revoked.'); } };

  return <div className="mx-auto max-w-6xl space-y-8"><header><h1 className="text-3xl font-bold text-text-primary">Users &amp; Invitations</h1><p className="mt-2 text-text-secondary">Manage firm access. Admin manages firm members and settings; Attorney performs firm legal and research work; Viewer is read-only.</p></header>{error && <div className="rounded bg-risk-high/10 p-3 text-risk-high" role="alert">{error} <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div>}{notice && <p className="rounded bg-forge-teal-700/10 p-3 text-text-primary" role="status">{notice}</p>}<section className="rounded border border-forge-silver-300 bg-surface-card p-5"><h2 className="text-xl font-bold text-text-primary">Invite a member</h2><form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => void invite(event)}><label className="text-sm font-semibold">Full name<input required className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label className="text-sm font-semibold">Email address<input required type="email" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="text-sm font-semibold">Role<select className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>{(['admin', 'attorney', 'viewer'] as UserRole[]).map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)} — {roleDescriptions[item]}</option>)}</select></label><div className="flex items-end"><Button disabled={saving} type="submit">{saving ? 'Sending…' : 'Send invitation'}</Button></div></form></section><section className="rounded border border-forge-silver-300 bg-surface-card p-5"><h2 className="text-xl font-bold text-text-primary">Members</h2>{loading ? <p className="mt-4" role="status">Loading members…</p> : members.length === 0 ? <p className="mt-4 text-text-secondary">No members found.</p> : <><div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">Member</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2">Last login</th></tr></thead><tbody>{members.map((member) => <tr className="border-b" key={member.id}><td className="p-2">{member.email}</td><td className="p-2"><label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.email}</label><select id={`role-${member.id}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value as UserRole)} className="rounded border border-forge-silver-300 p-1"><option value="admin">Admin</option><option value="attorney">Attorney</option><option value="viewer">Viewer</option></select></td><td className="p-2">{member.status}</td><td className="p-2">{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Not recorded'}</td></tr>)}</tbody></table></div><div className="mt-4 space-y-3 md:hidden">{members.map((member) => <article className="rounded border border-forge-silver-300 p-3" key={member.id}><p className="font-semibold">{member.email}</p><p className="text-sm text-text-secondary">{member.status} · {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'No login recorded'}</p><label className="mt-2 block text-sm">Role<select value={member.role} onChange={(event) => void changeRole(member, event.target.value as UserRole)} className="ml-2 rounded border p-1"><option value="admin">Admin</option><option value="attorney">Attorney</option><option value="viewer">Viewer</option></select></label></article>)}</div></>}</section><section className="rounded border border-forge-silver-300 bg-surface-card p-5"><h2 className="text-xl font-bold text-text-primary">Invitations</h2>{loading ? <p className="mt-4" role="status">Loading invitations…</p> : invitations.length === 0 ? <p className="mt-4 text-text-secondary">No invitations yet.</p> : <ul className="mt-4 space-y-3">{invitations.map((invitation) => <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-forge-silver-300 p-3" key={invitation.id}><div><p className="font-semibold">{invitation.intendedName || invitation.email} <span className="font-normal">({invitation.email})</span></p><p className="text-sm text-text-secondary">{invitation.role} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleString()} · invited by {invitation.issuerEmail ?? 'Administrator'}</p></div>{invitation.status === 'pending' && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void resend(invitation.id)}>Resend</Button><Button size="sm" variant="outline" onClick={() => void revoke(invitation.id)}>Revoke</Button></div>}</li>)}</ul>}</section></div>;
}
