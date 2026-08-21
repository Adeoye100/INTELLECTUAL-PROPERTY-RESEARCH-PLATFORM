import { badRequest } from '../errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin', 'attorney', 'viewer']);

function rejectInvalidBody() {
  throw badRequest('VALIDATION_ERROR', 'Request body is invalid.');
}

function requireObjectWithOnly(body, allowedFields) {
  if (!body || Array.isArray(body) || typeof body !== 'object') rejectInvalidBody();
  if (Object.keys(body).some((field) => !allowedFields.has(field))) rejectInvalidBody();
}

function validText(value, minimum, maximum = 200) {
  return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
}

export function validateFirmProvisioning(request, _response, next) {
  try {
    requireObjectWithOnly(request.body, new Set(['firmName']));
    if (!validText(request.body.firmName, 2)) rejectInvalidBody();
    next();
  } catch (error) {
    next(error);
  }
}

export function validateInvitationAcceptance(request, _response, next) {
  try {
    requireObjectWithOnly(request.body, new Set(['fullName', 'email']));
    if (!validText(request.body.fullName, 2)) rejectInvalidBody();
    if (request.body.email !== undefined && (
      typeof request.body.email !== 'string' || !EMAIL_PATTERN.test(request.body.email.trim())
    )) rejectInvalidBody();
    next();
  } catch (error) {
    next(error);
  }
}

export function validateInvitationIssue(request, _response, next) {
  try {
    requireObjectWithOnly(request.body, new Set(['fullName', 'email', 'role']));
    if (!validText(request.body.fullName, 2)
      || typeof request.body.email !== 'string'
      || !EMAIL_PATTERN.test(request.body.email.trim())
      || typeof request.body.role !== 'string'
      || !ROLES.has(request.body.role.toLowerCase())) rejectInvalidBody();
    next();
  } catch (error) {
    next(error);
  }
}
