import { AppError } from '../errors.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character]));
}

export function alertMailContent({ applicationUrl, recipientEmail, alert, watch, portfolioMark, riskScore }) {
  const markText = escapeHtml(portfolioMark?.markText ?? watch?.markText ?? 'Protected Mark');
  const candidateMark = escapeHtml(riskScore?.candidateMarkText ?? alert?.riskScore?.candidateMarkText ?? alert?.matchedMarkText ?? 'Candidate Mark');
  const severity = escapeHtml((alert?.severity ?? 'HIGH').toUpperCase());
  const source = escapeHtml(riskScore?.candidateSource ?? alert?.riskScore?.candidateSource ?? alert?.source ?? 'USPTO');
  const reference = escapeHtml(riskScore?.candidateRegistryReference ?? alert?.riskScore?.candidateRegistryReference ?? alert?.matchedFilingRef ?? 'N/A');
  const searchId = riskScore?.sourceRequestId ?? alert?.riskScore?.sourceRequestId ?? alert?.searchId ?? '';
  const resultId = riskScore?.id ?? alert?.riskScore?.id ?? alert?.candidateResultId ?? '';

  const reviewLink = `${applicationUrl.replace(/\/$/, '')}/search/risk/${encodeURIComponent(searchId)}/${encodeURIComponent(resultId)}`;
  const subject = `Potential trademark conflict detected for ${portfolioMark?.markText ?? 'Protected Mark'}`;

  const text = `Potential trademark conflict detected for ${portfolioMark?.markText ?? 'Protected Mark'}\n\n`
    + `Protected mark: ${portfolioMark?.markText ?? 'N/A'}\n`
    + `Candidate mark: ${riskScore?.candidateMarkText ?? 'N/A'}\n`
    + `Severity: ${severity}\n`
    + `Source: ${source} (${reference})\n\n`
    + `Review in Platform: ${reviewLink}\n\n`
    + `This is continuous risk monitoring based on verified registry data, not a legal opinion or trademark infringement determination.`;

  const html = `<p>Potential trademark conflict detected for <strong>${markText}</strong>.</p>`
    + `<p><strong>Protected mark:</strong> ${markText}<br>`
    + `<strong>Candidate mark:</strong> ${candidateMark}<br>`
    + `<strong>Severity:</strong> ${severity}<br>`
    + `<strong>Source:</strong> ${source} (Ref: ${reference})</p>`
    + `<p><a href="${escapeHtml(reviewLink)}">Review risk analysis in platform</a></p>`
    + `<p><small>This is continuous risk monitoring based on verified registry data, not a legal opinion or trademark infringement determination.</small></p>`;

  return { to: recipientEmail, subject, text, html };
}

export function digestMailContent({ applicationUrl, recipientEmail, alerts }) {
  const count = alerts.length;
  const subject = `Trademark Monitoring Digest: ${count} potential conflict${count === 1 ? '' : 's'} detected`;

  const alertItemsText = alerts.map((item, index) => {
    const markText = item.portfolioMark?.markText ?? 'Protected Mark';
    const candidateMark = item.riskScore?.candidateMarkText ?? 'Candidate Mark';
    const severity = (item.alert?.severity ?? 'HIGH').toUpperCase();
    const source = item.riskScore?.candidateSource ?? 'USPTO';
    const searchId = item.riskScore?.sourceRequestId ?? '';
    const resultId = item.riskScore?.id ?? '';
    const reviewLink = `${applicationUrl.replace(/\/$/, '')}/search/risk/${encodeURIComponent(searchId)}/${encodeURIComponent(resultId)}`;
    return `${index + 1}. Protected: ${markText} | Candidate: ${candidateMark} | Risk: ${severity} | Source: ${source}\n   Link: ${reviewLink}`;
  }).join('\n\n');

  const alertItemsHtml = alerts.map((item) => {
    const markText = escapeHtml(item.portfolioMark?.markText ?? 'Protected Mark');
    const candidateMark = escapeHtml(item.riskScore?.candidateMarkText ?? 'Candidate Mark');
    const severity = escapeHtml((item.alert?.severity ?? 'HIGH').toUpperCase());
    const source = escapeHtml(item.riskScore?.candidateSource ?? 'USPTO');
    const searchId = item.riskScore?.sourceRequestId ?? '';
    const resultId = item.riskScore?.id ?? '';
    const reviewLink = `${applicationUrl.replace(/\/$/, '')}/search/risk/${encodeURIComponent(searchId)}/${encodeURIComponent(resultId)}`;
    return `<li><strong>${markText}</strong> vs <strong>${candidateMark}</strong> (${severity} risk, ${source}) &mdash; <a href="${escapeHtml(reviewLink)}">Review</a></li>`;
  }).join('');

  const text = `Trademark Monitoring Digest (${count} potential conflict${count === 1 ? '' : 's'})\n\n`
    + `${alertItemsText}\n\n`
    + `This is continuous risk monitoring based on verified registry data, not a legal opinion or trademark infringement determination.`;

  const html = `<p><strong>Trademark Monitoring Digest</strong> (${count} potential conflict${count === 1 ? '' : 's'}):</p>`
    + `<ul>${alertItemsHtml}</ul>`
    + `<p><small>This is continuous risk monitoring based on verified registry data, not a legal opinion or trademark infringement determination.</small></p>`;

  return { to: recipientEmail, subject, text, html };
}

export class FakeAlertMailer {
  constructor({ applicationUrl = 'http://localhost:5173' } = {}) {
    this.applicationUrl = applicationUrl;
    this.messages = [];
  }
  async sendAlertEmail(input) {
    const message = alertMailContent({ applicationUrl: this.applicationUrl, ...input });
    this.messages.push(message);
    return { id: `fake-alert-mail-${this.messages.length}` };
  }
  async sendDigestEmail({ recipientEmail, alerts }) {
    const message = digestMailContent({ applicationUrl: this.applicationUrl, recipientEmail, alerts });
    this.messages.push(message);
    return { id: `fake-digest-mail-${this.messages.length}` };
  }
}

export class ResendAlertMailer {
  constructor({ applicationUrl, apiKey, from, fetchImplementation = globalThis.fetch }) {
    if (!applicationUrl || !apiKey || !from || typeof fetchImplementation !== 'function') {
      throw new TypeError('ResendAlertMailer requires applicationUrl, apiKey, from, and fetch.');
    }
    this.applicationUrl = applicationUrl;
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImplementation = fetchImplementation;
  }

  async sendEmail(message) {
    let response;
    try {
      response = await this.fetchImplementation('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
    } catch (error) {
      throw new AppError(503, 'ALERT_EMAIL_UNAVAILABLE', 'Alert email could not be delivered.', { cause: error?.name });
    }
    if (!response?.ok) {
      throw new AppError(503, 'ALERT_EMAIL_UNAVAILABLE', 'Alert email could not be delivered.');
    }
    return { id: response.headers.get('x-message-id') ?? null };
  }

  async sendAlertEmail(input) {
    const message = alertMailContent({ applicationUrl: this.applicationUrl, ...input });
    return this.sendEmail(message);
  }

  async sendDigestEmail({ recipientEmail, alerts }) {
    const message = digestMailContent({ applicationUrl: this.applicationUrl, recipientEmail, alerts });
    return this.sendEmail(message);
  }
}

export class DisabledAlertMailer {
  async sendAlertEmail() {
    throw new AppError(503, 'ALERT_EMAIL_DISABLED', 'Alert email delivery is disabled.');
  }
  async sendDigestEmail() {
    throw new AppError(503, 'ALERT_EMAIL_DISABLED', 'Alert email delivery is disabled.');
  }
}

export function createAlertMailer(config) {
  const provider = config?.invitationMailerProvider ?? (config?.environment === 'production' ? 'disabled' : 'fake');
  const applicationUrl = config?.publicApplicationUrl ?? 'http://localhost:5173';
  if (provider === 'fake') return new FakeAlertMailer({ applicationUrl });
  if (provider === 'resend') {
    return new ResendAlertMailer({
      applicationUrl,
      apiKey: config.invitationMailerApiKey,
      from: config.invitationMailerFrom,
    });
  }
  return new DisabledAlertMailer();
}
