const ACTIVE_USPTO_STATUSES = new Set(['registered', 'pending']);

/**
 * Retain normalized USPTO records that are currently active.
 * Nice Classes are intentionally not filtered by this policy.
 */
export function shouldRetainUsptoRecord(record) {
  return ACTIVE_USPTO_STATUSES.has(record?.status);
}
