import { AppError } from '../errors.js';

const MAX_LINKED_ITEMS = 100;

function sourceNotFound() { return new AppError(404, 'EXPORT_SOURCE_NOT_FOUND', 'Export source data was not found.'); }
function sourceUnavailable() { return new AppError(503, 'EXPORT_SOURCE_UNAVAILABLE', 'Export source data is temporarily unavailable.'); }
function safe(value, maximum = 500) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').normalize('NFKC').trim().slice(0, maximum) || null;
}
function safeList(values, maximum = 20) { return Array.isArray(values) ? values.slice(0, maximum).map((value) => safe(value, 100)).filter(Boolean) : []; }
function statusLine(status) {
  return { source: safe(status.source, 100), status: status.status === 'complete' ? 'complete' : 'unavailable', resultCount: Number.isSafeInteger(status.resultCount) ? status.resultCount : 0 };
}
function riskEvidence(result) {
  const risk = result.riskAnalysis;
  return {
    candidateMarkText: safe(result.candidateMarkText, 500), candidateSource: safe(result.candidateSource, 100),
    candidateRef: safe(result.candidateRef, 200), owner: safe(result.owner, 300), jurisdiction: safe(result.jurisdiction, 100),
    niceClasses: Array.isArray(result.niceClasses) ? result.niceClasses.slice(0, 45) : [], filingDate: safe(result.filingDate, 40),
    status: safe(result.status, 100),
    risk: {
      compositeRating: safe(risk.compositeRating, 30), compositeScore: risk.compositeScore ?? null,
      visualScore: risk.visualScore ?? null, phoneticScore: risk.phoneticScore ?? null,
      classOverlap: risk.classOverlap === true, classOverlapScore: risk.classOverlapScore ?? null,
      conceptualScore: risk.conceptualScore ?? null,
      methodology: { version: safe(risk.methodology?.version, 200), description: safe(risk.methodology?.description, 500) },
      matchedMarkRefs: Array.isArray(risk.matchedMarkRefs) ? risk.matchedMarkRefs.slice(0, 20).map((item) => ({
        type: safe(item.type, 50), evidence: safe(item.evidence, 1_000), score: item.score ?? null,
      })) : [],
    },
  };
}

/** Loads persisted, firm-scoped evidence only; it never calls a registry,
 * Elasticsearch, or the risk scorer. */
export class ExportSourceLoader {
  constructor({ searchResultService, portfolioMarkService, officeActionRefService, watchService = null, alertService = null }) {
    if (!searchResultService || typeof searchResultService.loadSearchSnapshotForExport !== 'function') {
      throw new TypeError('ExportSourceLoader needs the BE-19 search snapshot loader.');
    }
    if (!portfolioMarkService || typeof portfolioMarkService.getPortfolioMark !== 'function') {
      throw new TypeError('ExportSourceLoader needs a portfolio mark service.');
    }
    if (!officeActionRefService || typeof officeActionRefService.listOfficeActionRefs !== 'function') {
      throw new TypeError('ExportSourceLoader needs an Office Action reference service.');
    }
    this.searchResultService = searchResultService;
    this.portfolioMarkService = portfolioMarkService;
    this.officeActionRefService = officeActionRefService;
    this.watchService = watchService;
    this.alertService = alertService;
  }

  async searchSnapshot(record) {
    try {
      return await this.searchResultService.loadSearchSnapshotForExport({
        firmId: record.firmId, actorUserId: record.requestedByActorUserId, searchResultId: record.sourceEntityId,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SEARCH_RESULT_NOT_FOUND') throw sourceNotFound();
      throw sourceUnavailable();
    }
  }

  async load(record) {
    if (!record?.requestedByActorUserId) throw sourceNotFound();
    if (record.type === 'search_results') {
      const snapshot = await this.searchSnapshot(record);
      return {
        kind: 'search_results', sourceAttribution: 'Persisted search snapshot', searchId: snapshot.id,
        requestId: snapshot.requestId, query: snapshot.query, results: snapshot.results.map(riskEvidence),
        sourceStatuses: snapshot.sourceStatuses.map(statusLine), partial: snapshot.partial,
        methodologyVersions: safeList(snapshot.methodologyVersions, 20), createdAt: snapshot.createdAt,
      };
    }
    if (record.type === 'risk_report') {
      const snapshot = await this.searchSnapshot(record);
      const selected = snapshot.results.find((result) => result.id === record.parameters.resultId);
      if (!selected) throw sourceNotFound();
      return {
        kind: 'risk_report', sourceAttribution: 'Persisted search snapshot', searchId: snapshot.id,
        requestId: snapshot.requestId, query: snapshot.query, result: riskEvidence(selected),
        sourceStatuses: snapshot.sourceStatuses.map(statusLine), partial: snapshot.partial,
        methodologyVersions: safeList(snapshot.methodologyVersions, 20), createdAt: snapshot.createdAt,
      };
    }
    try {
      const portfolioMark = await this.portfolioMarkService.getPortfolioMark({ firmId: record.firmId, portfolioMarkId: record.sourceEntityId });
      const officeActions = await this.officeActionRefService.listOfficeActionRefs({
        firmId: record.firmId, portfolioMarkId: portfolioMark.id, pagination: { page: 1, pageSize: MAX_LINKED_ITEMS },
      });
      const [watches, alerts] = await Promise.all([
        record.parameters.includeWatches === false || !this.watchService ? { items: [] } : this.watchService.listWatches({
          firmId: record.firmId, filters: { portfolioMarkId: portfolioMark.id }, pagination: { page: 1, pageSize: MAX_LINKED_ITEMS },
        }),
        record.parameters.includeAlerts === false || !this.alertService ? { items: [] } : this.alertService.listAlerts({
          firmId: record.firmId, filters: { portfolioMarkId: portfolioMark.id }, pagination: { page: 1, pageSize: MAX_LINKED_ITEMS },
        }),
      ]);
      return {
        kind: 'portfolio_summary', sourceAttribution: 'Firm-scoped portfolio records',
        portfolioMark: {
          markText: safe(portfolioMark.markText, 500), jurisdiction: safe(portfolioMark.jurisdiction, 100),
          sourceRegistry: safe(portfolioMark.sourceRegistry, 100), registryReference: safe(portfolioMark.registryReference, 200),
          niceClasses: Array.isArray(portfolioMark.niceClasses) ? portfolioMark.niceClasses.slice(0, 45) : [],
          status: safe(portfolioMark.status, 100), filingDate: safe(portfolioMark.filingDate, 40),
          registrationDate: safe(portfolioMark.registrationDate, 40), renewalDate: safe(portfolioMark.renewalDate, 40),
        },
        officeActions: officeActions.items.slice(0, MAX_LINKED_ITEMS).map((item) => ({
          sourceRegistry: safe(item.sourceRegistry, 100), sourceReferenceId: safe(item.sourceReferenceId, 200),
          applicationNumber: safe(item.applicationNumber, 100), documentType: safe(item.documentType, 100),
          officeActionDate: safe(item.officeActionDate, 40), examinerName: safe(item.examinerName, 200),
          examinerReasoningSummary: safe(item.examinerReasoningSummary, 4_000), summaryMethod: safe(item.summaryMethod, 30),
        })),
        watches: watches.items.slice(0, MAX_LINKED_ITEMS).map((item) => ({ state: safe(item.state, 30), pollIntervalMinutes: item.pollIntervalMinutes, lastPolledAt: safe(item.lastPolledAt, 40), lastPollStatus: safe(item.lastPollStatus, 30) })),
        alerts: alerts.items.slice(0, MAX_LINKED_ITEMS).map((item) => ({ severity: safe(item.severity, 30), status: safe(item.status, 30), riskScore: item.riskScore ?? null, createdAt: safe(item.createdAt, 40) })),
      };
    } catch (error) {
      if (error instanceof AppError && ['PORTFOLIO_MARK_NOT_FOUND', 'OFFICE_ACTION_REF_NOT_FOUND'].includes(error.code)) {
        throw sourceNotFound();
      }
      throw sourceUnavailable();
    }
  }
}
