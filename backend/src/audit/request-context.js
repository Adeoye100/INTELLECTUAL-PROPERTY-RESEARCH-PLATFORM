import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 512;

function boundedHeader(value, maximum) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

function normalizeIp(value) {
  const candidate = boundedHeader(value, MAX_IP_LENGTH);
  if (!candidate) return null;
  const normalized = candidate.startsWith('::ffff:') && isIP(candidate.slice(7)) === 4
    ? candidate.slice(7)
    : candidate;
  return isIP(normalized) ? normalized : null;
}

function proxyTrustEnabled(request) {
  const trust = request.app?.get('trust proxy');
  return trust === true || (Number.isSafeInteger(trust) && trust > 0) || typeof trust === 'function';
}

function validGeneratedRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : null;
}

export function captureAuditRequestContext(request, { generateRequestId = randomUUID } = {}) {
  const suppliedRequestId = boundedHeader(request.requestId, 128)
    ?? boundedHeader(request.get?.('x-request-id'), 128);
  const requestId = suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
    ? suppliedRequestId
    : validGeneratedRequestId(generateRequestId());
  if (!requestId) throw new TypeError('Request ID generator must return a valid request ID.');

  // Express resolves request.ip from X-Forwarded-For only when its configured
  // trust-proxy setting permits it. Raw forwarded headers are never inspected.
  const address = proxyTrustEnabled(request)
    ? request.ip
    : request.socket?.remoteAddress;
  return Object.freeze({
    requestId,
    ipAddress: normalizeIp(address),
    userAgent: boundedHeader(request.get?.('user-agent'), MAX_USER_AGENT_LENGTH),
  });
}

export function createAuditRequestContextMiddleware(options) {
  return (request, _response, next) => {
    try {
      request.auditContext = captureAuditRequestContext(request, options);
      next();
    } catch (error) {
      next(error);
    }
  };
}
