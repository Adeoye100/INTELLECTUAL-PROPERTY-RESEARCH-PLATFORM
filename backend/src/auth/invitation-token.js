import { createHash, randomBytes } from 'node:crypto';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export function createOpaqueInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token) {
  if (typeof token !== 'string' || !OPAQUE_TOKEN_PATTERN.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

export function hashOpaqueToken(token) {
  return hashInvitationToken(token);
}

export function isOpaqueInvitationToken(token) {
  return hashInvitationToken(token) !== null;
}
