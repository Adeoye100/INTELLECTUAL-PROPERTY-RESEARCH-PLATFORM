import { AppError, badRequest, conflict } from '../errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/audit-taxonomy.js';
import { userRoleAuditSnapshot } from '../audit/audit-snapshots.js';
import { AUDIT_UUID_PATTERN } from '../audit/audit-service.js';

export const USER_ROLES = Object.freeze(['admin', 'attorney', 'viewer']);
const USER_ROLE_SET = new Set(USER_ROLES);

function userNotFound() {
  return new AppError(404, 'USER_NOT_FOUND', 'User not found.');
}

function uuid(value, field) {
  if (typeof value !== 'string' || !AUDIT_UUID_PATTERN.test(value)) {
    throw badRequest('VALIDATION_ERROR', `${field} must be a UUID.`, { field });
  }
  return value;
}

export function parseUserRoleChange(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 1 || typeof input.role !== 'string') {
    throw badRequest('VALIDATION_ERROR', 'body must be exactly { role: "admin" | "attorney" | "viewer" }.', { field: 'body' });
  }
  const role = input.role.trim().toLowerCase();
  if (!USER_ROLE_SET.has(role)) {
    throw badRequest('VALIDATION_ERROR', 'role must be admin, attorney, or viewer.', { field: 'role' });
  }
  return role;
}

export class UserRoleService {
  constructor({ userRepository, auditService, roleFirmResolver }) {
    if (!userRepository || typeof userRepository.withTransaction !== 'function'
      || typeof userRepository.findRoleTargetForUpdate !== 'function'
      || typeof userRepository.listActiveAdminsForUpdate !== 'function'
      || typeof userRepository.updateRole !== 'function') {
      throw new TypeError('UserRoleService needs the established transaction-capable user repository.');
    }
    if (!auditService || typeof auditService.record !== 'function') {
      throw new TypeError('UserRoleService needs an audit service.');
    }
    if (!roleFirmResolver || typeof roleFirmResolver.invalidate !== 'function') {
      throw new TypeError('UserRoleService needs the existing role/firm cache resolver.');
    }
    this.userRepository = userRepository;
    this.auditService = auditService;
    this.roleFirmResolver = roleFirmResolver;
  }

  async changeRole({ firmId, actorUserId, targetUserId, input, requestContext = null }) {
    const scopedFirmId = uuid(firmId, 'firmId');
    const scopedActorUserId = uuid(actorUserId, 'actorUserId');
    const scopedTargetUserId = uuid(targetUserId, 'id');
    const role = parseUserRoleChange(input);
    if (scopedActorUserId === scopedTargetUserId) {
      throw conflict('SELF_ROLE_CHANGE_FORBIDDEN', 'Users cannot change their own role.');
    }
    return this.userRepository.withTransaction(async (transaction) => {
      const before = await this.userRepository.findRoleTargetForUpdate({
        firmId: scopedFirmId, userId: scopedTargetUserId, transaction,
      });
      if (!before) throw userNotFound();
      if (before.role === role) {
        throw conflict('USER_ROLE_NOOP', 'User already has this role.');
      }
      if (before.role === 'admin' && role !== 'admin') {
        const activeAdminIds = await this.userRepository.listActiveAdminsForUpdate({
          firmId: scopedFirmId, transaction,
        });
        if (activeAdminIds.length <= 1) {
          throw conflict('LAST_ACTIVE_ADMIN', 'A firm must retain at least one active Admin.');
        }
      }
      const after = await this.userRepository.updateRole({
        firmId: scopedFirmId, userId: scopedTargetUserId, role, transaction,
      });
      if (!after) throw userNotFound();
      await this.auditService.record({
        transaction,
        requireTransaction: true,
        firmId: scopedFirmId,
        actorUserId: scopedActorUserId,
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        entityType: AUDIT_ENTITY_TYPES.USER,
        entityId: scopedTargetUserId,
        beforeState: userRoleAuditSnapshot(before),
        afterState: userRoleAuditSnapshot(after),
        metadata: { changedFields: ['role'] },
        requestContext,
      });
      // The database role is authoritative. Cache invalidation is deliberately
      // inside the workflow so a cache failure cannot report a role change.
      if (after.supabaseUserId) await this.roleFirmResolver.invalidate(after.supabaseUserId);
      return userRoleAuditSnapshot(after);
    });
  }
}
