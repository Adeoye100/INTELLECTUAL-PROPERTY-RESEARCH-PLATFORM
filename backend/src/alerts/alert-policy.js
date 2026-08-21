const RATING_TO_SEVERITY = Object.freeze({ medium: 'medium', high: 'high' });
const EVIDENCE_TYPES = Object.freeze(['Visual', 'Phonetic', 'Class']);

export const WATCH_ALERT_POLICY = Object.freeze({ version: 'watch-alert-policy-v1.0.0' });

function score(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function text(value) { return typeof value === 'string' && value.trim().length > 0; }

export function completeAttributedRisk(result) {
  const risk = result?.riskAnalysis;
  if (!result || typeof result !== 'object' || !risk || typeof risk !== 'object'
    || !text(result.markText) || !text(result.sourceRegistry) || !text(result.sourceReferenceId)
    || risk.candidateSource !== result.sourceRegistry || risk.candidateRef !== result.sourceReferenceId
    || !score(risk.visualScore) || !score(risk.phoneticScore) || !score(risk.classOverlapScore)
    || !score(risk.compositeScore) || (risk.conceptualScore !== null && !score(risk.conceptualScore))
    || (!Object.hasOwn(RATING_TO_SEVERITY, risk.compositeRating) && risk.compositeRating !== 'low')
    || !risk.methodology || !text(risk.methodology.version)
    || !Array.isArray(risk.methodology.sourceAttribution)
    || !risk.methodology.sourceAttribution.includes(result.sourceRegistry)
    || !Array.isArray(risk.matchedMarkRefs) || risk.matchedMarkRefs.length !== 3
    || !risk.matchedMarkRefs.every((entry, index) => entry && entry.type === EVIDENCE_TYPES[index]
      && text(entry.evidence) && score(entry.score))) return false;
  return true;
}

export function evaluateWatchAlertPolicy(result) {
  if (!completeAttributedRisk(result)) return { eligible: false, code: 'RISK_EVIDENCE_INVALID' };
  const severity = RATING_TO_SEVERITY[result.riskAnalysis.compositeRating];
  return severity
    ? { eligible: true, severity, policyVersion: WATCH_ALERT_POLICY.version }
    : { eligible: false, code: 'RISK_BELOW_ALERT_THRESHOLD' };
}
