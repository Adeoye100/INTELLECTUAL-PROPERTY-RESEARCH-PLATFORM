import {
  niceClassOverlap,
  normalizeMarkText,
  phoneticSimilarity,
  visualSimilarity,
} from './similarity.js';

/**
 * Provisional engineering defaults pending expert calibration and staging
 * evidence. Changes to these values require a new methodology version.
 */
export const CONFUSION_RISK_METHODOLOGY = Object.freeze({
  version: 'confusion-risk-v1.0.0-provisional',
  weights: Object.freeze({
    visual: 0.4,
    phonetic: 0.4,
    classOverlap: 0.2,
  }),
  thresholds: Object.freeze({
    medium: 50,
    high: 75,
  }),
});

const METHODOLOGY_DESCRIPTION = 'Provisional engineering research signal based on visual, phonetic, and Nice-class overlap scores; pending expert calibration and staging evidence.';

function assertScore(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${name} must be a finite number from 0 through 100.`);
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

/**
 * Calculate the methodology's weighted composite score and round once after
 * the complete weighted total has been calculated.
 */
export function calculateCompositeScore({ visualScore, phoneticScore, classOverlapScore }) {
  assertScore(visualScore, 'visualScore');
  assertScore(phoneticScore, 'phoneticScore');
  assertScore(classOverlapScore, 'classOverlapScore');

  const { visual, phonetic, classOverlap } = CONFUSION_RISK_METHODOLOGY.weights;
  return Math.round(
    (visualScore * visual)
    + (phoneticScore * phonetic)
    + (classOverlapScore * classOverlap),
  );
}

/** Classify a valid 0–100 composite score according to the frozen methodology. */
export function classifyCompositeScore(score) {
  assertScore(score, 'score');
  const { medium, high } = CONFUSION_RISK_METHODOLOGY.thresholds;
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  return 'low';
}

function classEvidence(overlap) {
  if (!overlap.hasOverlap) {
    return {
      type: 'Class',
      evidence: `Nice-class overlap: none (${overlap.overlapScore}/100).`,
      score: overlap.overlapScore,
    };
  }
  return {
    type: 'Class',
    evidence: `Nice-class overlap: ${overlap.intersection.join(', ')} (${overlap.overlapScore}/100).`,
    score: overlap.overlapScore,
  };
}

/**
 * Produce an attributed, deterministic provisional confusion-risk research
 * signal for a proposed mark and one registry candidate. This is not a legal
 * determination and has no persistence or search-infrastructure dependency.
 */
export function scoreConfusionRisk({ proposedMark, candidate }) {
  if (!proposedMark || typeof proposedMark !== 'object') {
    throw new TypeError('proposedMark must be an object.');
  }
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('candidate must be an object.');
  }

  const proposedMarkText = normalizeMarkText(proposedMark.markText);
  const candidateMarkText = normalizeMarkText(candidate.markText);
  assertNonEmptyString(candidate.recordId, 'candidate.recordId');
  assertNonEmptyString(candidate.sourceRegistry, 'candidate.sourceRegistry');
  assertNonEmptyString(candidate.sourceReferenceId, 'candidate.sourceReferenceId');

  const overlap = niceClassOverlap(proposedMark.niceClasses, candidate.niceClasses);
  const visualScore = visualSimilarity(proposedMarkText, candidateMarkText);
  const phoneticScore = phoneticSimilarity(proposedMarkText, candidateMarkText);
  const classOverlapScore = overlap.overlapScore;
  const compositeScore = calculateCompositeScore({
    visualScore,
    phoneticScore,
    classOverlapScore,
  });

  return {
    candidateRecordId: candidate.recordId,
    candidateSource: candidate.sourceRegistry,
    candidateRef: candidate.sourceReferenceId,
    phoneticScore,
    visualScore,
    conceptualScore: null,
    classOverlap: overlap.hasOverlap,
    classOverlapScore,
    compositeScore,
    compositeRating: classifyCompositeScore(compositeScore),
    methodology: {
      version: CONFUSION_RISK_METHODOLOGY.version,
      description: METHODOLOGY_DESCRIPTION,
      sourceAttribution: [candidate.sourceRegistry],
    },
    matchedMarkRefs: [
      {
        type: 'Visual',
        evidence: `Normalized edit-distance similarity: ${visualScore}/100.`,
        score: visualScore,
      },
      {
        type: 'Phonetic',
        evidence: `Soundex token similarity: ${phoneticScore}/100.`,
        score: phoneticScore,
      },
      classEvidence(overlap),
    ],
  };
}
