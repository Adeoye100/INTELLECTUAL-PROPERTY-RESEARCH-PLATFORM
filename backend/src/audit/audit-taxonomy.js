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
  EXPORT_REQUESTED: 'export.requested',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_FAILED: 'export.failed',
  OFFICE_ACTION_REF_CREATED: 'office_action_ref.created',
  OFFICE_ACTION_REF_UPDATED: 'office_action_ref.updated',
  OFFICE_ACTION_REF_DELETED: 'office_action_ref.deleted',
});

export const AUDIT_ENTITY_TYPES = Object.freeze({
  PORTFOLIO_MARK: 'portfolio_mark',
  WATCH: 'watch',
  ALERT: 'alert',
  USER: 'user',
  EXPORT: 'export',
  OFFICE_ACTION_REF: 'office_action_ref',
});

export const AUDIT_ACTION_VALUES = Object.freeze(Object.values(AUDIT_ACTIONS));
export const AUDIT_ENTITY_TYPE_VALUES = Object.freeze(Object.values(AUDIT_ENTITY_TYPES));

const auditActionSet = new Set(AUDIT_ACTION_VALUES);
const auditEntityTypeSet = new Set(AUDIT_ENTITY_TYPE_VALUES);

export const isSupportedAuditAction = (value) => auditActionSet.has(value);
export const isSupportedAuditEntityType = (value) => auditEntityTypeSet.has(value);
