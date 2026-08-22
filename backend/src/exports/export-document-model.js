const NOT_AVAILABLE = 'Not available';

function value(input) { return input === null || input === undefined || input === '' ? NOT_AVAILABLE : String(input); }
function pairs(input) { return Object.entries(input).map(([label, item]) => `${label}: ${value(item)}`); }
function evidenceLines(result) {
  const risk = result.risk;
  const lines = [
    `Candidate: ${value(result.candidateMarkText)} (${value(result.candidateSource)} ${value(result.candidateRef)})`,
    `Owner: ${value(result.owner)} | Jurisdiction: ${value(result.jurisdiction)} | Classes: ${result.niceClasses.join(', ') || NOT_AVAILABLE}`,
    `Status: ${value(result.status)} | Filing date: ${value(result.filingDate)}`,
    `Risk: ${value(risk.compositeRating).toUpperCase()} | Composite score: ${value(risk.compositeScore)}`,
    `Visual evidence score (Visual similarity component): ${value(risk.visualScore)} / 100`,
    `Phonetic evidence score (Phonetic similarity component): ${value(risk.phoneticScore)} / 100`,
    `Class evidence (Nice-class overlap component): ${value(risk.classOverlapScore)} / 100 — ${risk.classOverlap ? 'Overlap identified' : 'No overlapping classes'}`,
    `Conceptual score: ${value(risk.conceptualScore)}`,
    `Methodology: ${value(risk.methodology.version)} — ${value(risk.methodology.description)}`,
  ];
  for (const item of risk.matchedMarkRefs) lines.push(`${value(item.type)} evidence (${value(item.score)}): ${value(item.evidence)}`);
  return lines;
}
function base(title, sourceAttribution) {
  return { title, sourceAttribution, disclaimer: 'Research assistance only. This report is not legal advice and does not make a legal conclusion.', sections: [] };
}
function sourceStatus(lines, statuses, partial) {
  lines.push(`Search completeness: ${partial ? 'Partial — one or more sources were unavailable.' : 'Complete according to configured sources.'}`);
  for (const status of statuses) lines.push(`Source ${value(status.source)}: ${status.status} (${status.resultCount} result(s))`);
}

export function createExportDocumentModel(model) {
  if (!model || typeof model !== 'object') throw new TypeError('An export document model is required.');
  if (model.kind === 'search_results') {
    const output = base('Search Results Research Report', model.sourceAttribution);
    const overview = pairs({ 'Persisted search ID': model.searchId, 'Request ID': model.requestId, 'Created at': model.createdAt, 'Methodology versions': model.methodologyVersions.join(', ') || NOT_AVAILABLE });
    sourceStatus(overview, model.sourceStatuses, model.partial);
    output.sections.push({ heading: 'Search context', lines: [...overview, ...pairs(model.query)] });
    model.results.forEach((result, index) => output.sections.push({ heading: `Result ${index + 1}`, lines: evidenceLines(result) }));
    if (!model.results.length) output.sections.push({ heading: 'Results', lines: ['No results were returned in the persisted search snapshot.'] });
    return output;
  }
  if (model.kind === 'risk_report') {
    const output = base('Individual Confusion-Risk Research Report', model.sourceAttribution);
    const overview = pairs({ 'Persisted search ID': model.searchId, 'Request ID': model.requestId, 'Created at': model.createdAt, 'Methodology versions': model.methodologyVersions.join(', ') || NOT_AVAILABLE });
    sourceStatus(overview, model.sourceStatuses, model.partial);
    output.sections.push({ heading: 'Search context', lines: [...overview, ...pairs(model.query)] });
    output.sections.push({ heading: 'Stored risk evidence', lines: evidenceLines(model.result) });
    return output;
  }
  if (model.kind === 'portfolio_summary') {
    const output = base('Portfolio Mark Summary', model.sourceAttribution);
    output.sections.push({ heading: 'Portfolio mark', lines: pairs({
      Mark: model.portfolioMark.markText, Jurisdiction: model.portfolioMark.jurisdiction,
      'Registry provenance': `${value(model.portfolioMark.sourceRegistry)} ${value(model.portfolioMark.registryReference)}`,
      'Nice classes': model.portfolioMark.niceClasses.join(', ') || null, Status: model.portfolioMark.status,
      'Filing date': model.portfolioMark.filingDate, 'Registration date': model.portfolioMark.registrationDate,
      'Renewal date': model.portfolioMark.renewalDate,
      'Renewal deadline state': renewalState(model.portfolioMark.renewalDate),
    }) });
    output.sections.push({ heading: 'Attributed Office Actions', lines: model.officeActions.length ? model.officeActions.flatMap((item) => pairs({
      Source: `${value(item.sourceRegistry)} ${value(item.sourceReferenceId)}`, Application: item.applicationNumber,
      'Document type': item.documentType, 'Office Action date': item.officeActionDate, Examiner: item.examinerName,
      'Reasoning summary': item.examinerReasoningSummary, 'Summary attribution': item.summaryMethod,
    })) : [NOT_AVAILABLE] });
    output.sections.push({ heading: 'Watch summary', lines: model.watches.length ? model.watches.flatMap((item) => pairs({
      State: item.state, 'Poll interval minutes': item.pollIntervalMinutes, 'Last polled': item.lastPolledAt, 'Last status': item.lastPollStatus,
    })) : [NOT_AVAILABLE] });
    output.sections.push({ heading: 'Alert summary', lines: model.alerts.length ? model.alerts.flatMap((item) => pairs({
      Severity: item.severity, Status: item.status, 'Stored risk score': item.riskScore, Created: item.createdAt,
    })) : [NOT_AVAILABLE] });
    return output;
  }
  throw new TypeError('Unsupported export document model.');
}

function renewalState(date) {
  if (!date) return 'No renewal date';
  const target = Date.parse(`${date}T00:00:00Z`); const today = new Date(); const days = Math.floor((target - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);
  if (!Number.isFinite(days)) return 'No renewal date';
  if (days < 0) return 'Overdue'; if (days <= 30) return 'Due soon'; return 'Upcoming';
}
