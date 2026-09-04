export const AUDIT_ACTIONS = Object.freeze({
  PORTFOLIO_MARK_CREATED: 'portfolio_mark.created',
  PORTFOLIO_MARK_UPDATED: 'portfolio_mark.updated',
  PORTFOLIO_MARK_DELETED: 'portfolio_mark.deleted',
  WATCH_CREATED: 'watch.created',
  WATCH_UPDATED: 'watch.updated',
  WATCH_DELETED: 'watch.deleted',
  WATCH_ENABLED: 'watch.enabled',
  WATCH_DISABLED: 'watch.disabled',
  ALERT_READ: 'alert.read',
  ALERT_DISMISSED: 'alert.dismissed',
  USER_ROLE_CHANGED: 'user.role_changed',
  INVITATION_ISSUED: 'invitation.issued',
  INVITATION_RESENT: 'invitation.resent',
  INVITATION_REVOKED: 'invitation.revoked',
  INVITATION_ACCEPTED: 'invitation.accepted',
  EXPORT_REQUESTED: 'export.requested',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_FAILED: 'export.failed',
  OFFICE_ACTION_REF_CREATED: 'office_action_ref.created',
  OFFICE_ACTION_REF_UPDATED: 'office_action_ref.updated',
  OFFICE_ACTION_REF_DELETED: 'office_action_ref.deleted',
  SEARCH_EXECUTED: 'search.executed',
  BILLING_CHECKOUT_INITIALIZED: 'billing.checkout_initialized',
  BILLING_PAYMENT_CONFIRMED: 'billing.payment_confirmed',
});

export const AUDIT_ENTITY_TYPES = Object.freeze({
  PORTFOLIO_MARK: 'portfolio_mark',
  WATCH: 'watch',
  ALERT: 'alert',
  USER: 'user',
  INVITATION: 'invitation',
  EXPORT: 'export',
  OFFICE_ACTION_REF: 'office_action_ref',
  SEARCH_RESULT: 'search_result',
  BILLING_TRANSACTION: 'billing_transaction',
});

export const AUDIT_ACTION_VALUES = Object.freeze(Object.values(AUDIT_ACTIONS));
export const AUDIT_ENTITY_TYPE_VALUES = Object.freeze(Object.values(AUDIT_ENTITY_TYPES));

const auditActionSet = new Set(AUDIT_ACTION_VALUES);
const auditEntityTypeSet = new Set(AUDIT_ENTITY_TYPE_VALUES);

export const isSupportedAuditAction = (value) => auditActionSet.has(value);
export const isSupportedAuditEntityType = (value) => auditEntityTypeSet.has(value);
