import { AppError } from '../errors.js';

const PAYSTACK_API = 'https://api.paystack.co';

export class PaystackClient {
  constructor({ secretKey, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
    if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_')) {
      throw new TypeError('PaystackClient requires a server-side secret key.');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('PaystackClient requires fetch.');
    this.secretKey = secretKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${PAYSTACK_API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppError(502, 'PAYSTACK_UNAVAILABLE', 'The payment provider is temporarily unavailable.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status !== true || !payload.data) {
      throw new AppError(502, 'PAYSTACK_REQUEST_FAILED', 'The payment provider could not complete the request.');
    }
    return payload.data;
  }

  initializeTransaction(input) {
    return this.request('/transaction/initialize', { method: 'POST', body: input });
  }

  verifyTransaction(reference) {
    return this.request(`/transaction/verify/${encodeURIComponent(reference)}`);
  }

  fetchSubscription(subscriptionCode) {
    return this.request(`/subscription/${encodeURIComponent(subscriptionCode)}`);
  }
}
