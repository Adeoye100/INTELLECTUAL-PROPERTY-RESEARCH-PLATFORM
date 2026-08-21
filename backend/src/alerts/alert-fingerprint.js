import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function riskFingerprint({ firmId, watchId, portfolioMarkId, result }) {
  const risk = result.riskAnalysis;
  const evidence = [...risk.matchedMarkRefs]
    .map((entry) => canonical(entry))
    .sort((left, right) => String(left.type).localeCompare(String(right.type)));
  const source = canonical({
    firmId, watchId, portfolioMarkId, candidateSource: result.sourceRegistry,
    candidateRegistryReference: result.sourceReferenceId, candidateMarkText: result.markText,
    visualScore: risk.visualScore, phoneticScore: risk.phoneticScore,
    classOverlapScore: risk.classOverlapScore, compositeScore: risk.compositeScore,
    conceptualScore: risk.conceptualScore, compositeRating: risk.compositeRating,
    methodologyVersion: risk.methodology.version, evidence,
  });
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}
