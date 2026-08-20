/**
 * Synthetic, non-authoritative engineering fixtures. These are not court
 * decisions, registry determinations, or legally validated conflict pairs.
 */
export const SYNTHETIC_CONFUSION_RISK_FIXTURE_NOTICE = 'Synthetic and non-authoritative confusion-risk calibration fixtures.';

export const SYNTHETIC_CONFUSION_RISK_PAIRS = Object.freeze([
  Object.freeze({
    label: 'identical marks and classes',
    proposedMark: { markText: 'Forge Labs', niceClasses: [9, 42] },
    candidate: { recordId: 'synthetic-1', markText: 'Forge Labs', niceClasses: [9, 42], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-001' },
    expectedRating: 'high',
  }),
  Object.freeze({
    label: 'punctuation case and diacritic normalization',
    proposedMark: { markText: '  Fórge+Labs™  ', niceClasses: [9, 42] },
    candidate: { recordId: 'synthetic-2', markText: 'forge labs', niceClasses: [42, 9], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-002' },
    expectedRating: 'high',
  }),
  Object.freeze({
    label: 'strong phonetic similarity',
    proposedMark: { markText: 'Robert', niceClasses: [9] },
    candidate: { recordId: 'synthetic-3', markText: 'Rupert', niceClasses: [9], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-003' },
    expectedRating: 'high',
  }),
  Object.freeze({
    label: 'visual similarity with different Soundex tokens',
    proposedMark: { markText: 'Dove', niceClasses: [9] },
    candidate: { recordId: 'synthetic-4', markText: 'Love', niceClasses: [9], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-004' },
    expectedRating: 'medium',
  }),
  Object.freeze({
    label: 'same mark without class overlap',
    proposedMark: { markText: 'Forge', niceClasses: [9] },
    candidate: { recordId: 'synthetic-5', markText: 'Forge', niceClasses: [35], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-005' },
    expectedRating: 'high',
  }),
  Object.freeze({
    label: 'unrelated marks without class overlap',
    proposedMark: { markText: 'Alpha', niceClasses: [9] },
    candidate: { recordId: 'synthetic-6', markText: 'Zulu', niceClasses: [35], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-006' },
    expectedRating: 'low',
  }),
  Object.freeze({
    label: 'duplicate-token phonetic comparison',
    proposedMark: { markText: 'Robert Robert Smith', niceClasses: [9] },
    candidate: { recordId: 'synthetic-7', markText: 'Smith Robert Jones', niceClasses: [9], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-007' },
    expectedPhoneticScore: 67,
  }),
  Object.freeze({
    label: 'multi-class partial overlap',
    proposedMark: { markText: 'Forge', niceClasses: [9, 42] },
    candidate: { recordId: 'synthetic-8', markText: 'Forge', niceClasses: [9, 35, 42], sourceRegistry: 'USPTO', sourceReferenceId: 'SYN-008' },
    expectedClassOverlapScore: 67,
  }),
  Object.freeze({
    label: 'candidate provenance preservation',
    proposedMark: { markText: 'Forge', niceClasses: [9] },
    candidate: { recordId: 'internal-synthetic-row', markText: 'Forge', niceClasses: [9], sourceRegistry: 'EUIPO', sourceReferenceId: 'EU-SYN-009' },
    expectedCandidateRef: 'EU-SYN-009',
  }),
]);
