import { AppError } from '../errors.js';
import { riskFingerprint } from './alert-fingerprint.js';
import { evaluateWatchAlertPolicy, completeAttributedRisk } from './alert-policy.js';
import { UUID_PATTERN } from '../watch/watch-validation.js';

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function contextValid({ firmId, watchId, portfolioMarkId, requestId, polledAt, results, sourceStatuses }) {
  return UUID_PATTERN.test(firmId ?? '') && UUID_PATTERN.test(watchId ?? '')
    && UUID_PATTERN.test(portfolioMarkId ?? '') && typeof requestId === 'string' && requestId.trim().length > 0
    && requestId.length <= 100 && validDate(polledAt) && Array.isArray(results) && Array.isArray(sourceStatuses);
}

function sourceUnavailable(sourceStatuses, source) {
  return sourceStatuses.some((status) => status?.source === source && status?.status === 'unavailable');
}

function snapshotFrom({ firmId, watchId, portfolioMarkId, requestId, polledAt, result, sourceStatuses, partial }) {
  const risk = result.riskAnalysis;
  return {
    firmId, watchId, portfolioMarkId, candidateSource: result.sourceRegistry,
    candidateRegistryReference: result.sourceReferenceId, candidateMarkText: result.markText,
    visualScore: risk.visualScore, phoneticScore: risk.phoneticScore,
    classOverlapScore: risk.classOverlapScore, compositeScore: risk.compositeScore,
    conceptualScore: risk.conceptualScore, compositeRating: risk.compositeRating,
    methodologyVersion: risk.methodology.version, matchedMarkRefs: risk.matchedMarkRefs.map((entry) => ({ ...entry })),
    sourceRequestId: requestId, sourceStatuses: sourceStatuses.map((entry) => ({ ...entry })),
    sourcePartial: partial, observedAt: polledAt,
    fingerprint: riskFingerprint({ firmId, watchId, portfolioMarkId, result }),
  };
}

export class AlertGenerationService {
  constructor({ repository }) {
    if (!repository || typeof repository.persistSnapshotAndAlert !== 'function') {
      throw new TypeError('AlertGenerationService needs an alert repository.');
    }
    this.repository = repository;
  }

  async generateAlertsForWatchPoll({
    firmId, watchId, portfolioMarkId, requestId, polledAt, results, sourceStatuses, partial,
  }) {
    if (!contextValid({ firmId, watchId, portfolioMarkId, requestId, polledAt, results, sourceStatuses })
      || typeof partial !== 'boolean') {
      throw new AppError(500, 'ALERT_GENERATION_INVALID_CONTEXT', 'Alert generation could not be completed.');
    }
    const generated = { riskScores: [], alerts: [], skipped: [], partial: partial === true };
    for (const result of results) {
      if (!completeAttributedRisk(result)) {
        generated.skipped.push({ code: 'RISK_EVIDENCE_INVALID' });
        continue;
      }
      if (sourceUnavailable(sourceStatuses, result.sourceRegistry)) {
        generated.skipped.push({ code: 'RISK_SOURCE_UNAVAILABLE' });
        continue;
      }
      const policy = evaluateWatchAlertPolicy(result);
      const snapshot = snapshotFrom({
        firmId, watchId, portfolioMarkId, requestId, polledAt, result, sourceStatuses, partial,
      });
      try {
        const persisted = await this.repository.persistSnapshotAndAlert({ snapshot, alertPolicy: policy });
        generated.riskScores.push(persisted.riskScore);
        if (persisted.alert) generated.alerts.push(persisted.alert);
        if (!policy.eligible) generated.skipped.push({ code: policy.code });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'ALERT_PERSISTENCE_FAILED', 'Alert evidence could not be persisted.');
      }
    }
    return generated;
  }
}
