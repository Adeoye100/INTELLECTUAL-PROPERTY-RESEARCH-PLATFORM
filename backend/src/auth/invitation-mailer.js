import { AppError } from '../errors.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function invitationLink(applicationUrl, token) {
  const url = new URL(`/auth/invite/${encodeURIComponent(token)}`, applicationUrl);
  return url.toString();
}

export function invitationMailContent({ applicationUrl, invitation, token }) {
  const link = invitationLink(applicationUrl, token);
  const role = invitation.role[0].toUpperCase() + invitation.role.slice(1);
  const firmName = escapeHtml(invitation.firmName);
  const recipientName = escapeHtml(invitation.intendedName);
  const plainName = invitation.intendedName || invitation.email;
  return {
    to: invitation.email,
    subject: `You are invited to join ${invitation.firmName}`,
    text: `${plainName},\n\nYou have been invited to join ${invitation.firmName} as a ${role}. Accept your invitation before ${invitation.expiresAt.toISOString()}:\n${link}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    html: `<p>Hello ${recipientName},</p><p>You have been invited to join <strong>${firmName}</strong> as a <strong>${escapeHtml(role)}</strong>.</p><p><a href="${escapeHtml(link)}">Accept invitation</a></p><p>This invitation expires ${escapeHtml(invitation.expiresAt.toISOString())}. If you were not expecting it, you can ignore this email.</p>`,
  };
}

export class UnavailableInvitationMailer {
  constructor(reason = 'Invitation email delivery is not configured.') { this.reason = reason; }
  assertAvailable() { throw new AppError(503, 'INVITATION_EMAIL_UNAVAILABLE', this.reason); }
  async sendInvitation() { this.assertAvailable(); }
}

/** Deterministic, credential-free delivery adapter for unit/integration tests. */
export class FakeInvitationMailer {
  constructor({ applicationUrl = 'http://localhost:5173' } = {}) { this.applicationUrl = applicationUrl; this.messages = []; }
  assertAvailable() {}
  async sendInvitation(input) {
    const message = invitationMailContent({ applicationUrl: this.applicationUrl, ...input });
    this.messages.push(message);
    return { id: `fake-${this.messages.length}` };
  }
}

export class ResendInvitationMailer {
  constructor({ applicationUrl, apiKey, from, fetchImplementation = globalThis.fetch }) {
    if (!applicationUrl || !apiKey || !from || typeof fetchImplementation !== 'function') throw new TypeError('ResendInvitationMailer requires applicationUrl, apiKey, from, and fetch.');
    this.applicationUrl = applicationUrl;
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImplementation = fetchImplementation;
  }
  assertAvailable() {}
  async sendInvitation(input) {
    const message = invitationMailContent({ applicationUrl: this.applicationUrl, ...input });
    let response;
    try {
      response = await this.fetchImplementation('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      });
    } catch (error) {
      throw new AppError(503, 'INVITATION_EMAIL_UNAVAILABLE', 'Invitation email could not be delivered. Please retry.', { cause: error?.name });
    }
    if (!response?.ok) throw new AppError(503, 'INVITATION_EMAIL_UNAVAILABLE', 'Invitation email could not be delivered. Please retry.');
    return { id: response.headers.get('x-message-id') ?? null };
  }
}

export function createInvitationMailer(config) {
  const provider = config.invitationMailerProvider ?? (config.environment === 'production' ? 'disabled' : 'fake');
  const applicationUrl = config.publicApplicationUrl ?? 'http://localhost:5173';
  if (provider === 'fake') return new FakeInvitationMailer({ applicationUrl });
  if (provider === 'resend') return new ResendInvitationMailer({ applicationUrl, apiKey: config.invitationMailerApiKey, from: config.invitationMailerFrom });
  return new UnavailableInvitationMailer();
}
