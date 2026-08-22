function pick(record, fields) {
  const snapshot = {};
  for (const field of fields) {
    if (Object.hasOwn(record, field)) snapshot[field] = record[field];
  }
  return snapshot;
}

export function portfolioMarkAuditSnapshot(record) {
  return pick(record, [
    'id', 'markText', 'jurisdiction', 'sourceRegistry', 'registryReference', 'niceClasses',
    'status', 'filingDate', 'registrationDate', 'renewalDate',
  ]);
}

export function watchAuditSnapshot(record) {
  return pick(record, [
    'id', 'portfolioMarkId', 'state', 'pollIntervalMinutes', 'nextPollAt', 'lastPolledAt',
    'lastPollStatus', 'lastErrorCode',
  ]);
}

export function alertAuditSnapshot(record) {
  return pick(record, [
    'id', 'watchId', 'portfolioMarkId', 'riskScoreId', 'severity', 'status', 'policyVersion',
    'readAt', 'dismissedAt',
  ]);
}

export function userRoleAuditSnapshot(record) {
  return pick(record, ['id', 'role', 'active']);
}

export function officeActionRefAuditSnapshot(record) {
  return pick(record, [
    'id', 'portfolioMarkId', 'sourceRegistry', 'sourceReferenceId', 'applicationNumber',
    'documentType', 'officeActionDate', 'examinerName', 'examinerReasoningSummary',
    'summaryMethod', 'sourceDocumentUrl', 'sourceMetadata',
  ]);
}

/** A bounded summary only; immutable search evidence stays in search_results. */
export function searchExecutionAuditSnapshot(record) {
  return pick(record, ['searchId', 'resultCount', 'partial', 'methodologyVersions']);
}
