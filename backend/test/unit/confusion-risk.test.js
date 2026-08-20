import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONFUSION_RISK_METHODOLOGY,
  calculateCompositeScore,
  classifyCompositeScore,
  scoreConfusionRisk,
} from '../../src/risk/confusion-risk.js';

const proposedMark = {
  markText: 'Forge Labs',
  niceClasses: [9, 42],
};

function candidate(overrides = {}) {
  return {
    recordId: 'internal-registry-row-17',
    markText: 'Forge Labs',
    niceClasses: [9, 42],
    sourceRegistry: 'USPTO',
    sourceReferenceId: 'US-98765432',
    ...overrides,
  };
}

describe('BE-10B versioned provisional confusion-risk methodology', () => {
  it('exports an immutable methodology whose weights total exactly one', () => {
    assert.ok(Object.isFrozen(CONFUSION_RISK_METHODOLOGY));
    assert.ok(Object.isFrozen(CONFUSION_RISK_METHODOLOGY.weights));
    assert.ok(Object.isFrozen(CONFUSION_RISK_METHODOLOGY.thresholds));
    assert.equal(Object.values(CONFUSION_RISK_METHODOLOGY.weights).reduce((sum, weight) => sum + weight, 0), 1);
    assert.throws(() => {
      CONFUSION_RISK_METHODOLOGY.weights.visual = 0.5;
    }, TypeError);
  });

  it('uses the specified composite formula and rounds only once at the end', () => {
    assert.equal(calculateCompositeScore({ visualScore: 80, phoneticScore: 70, classOverlapScore: 50 }), 70);
    assert.equal(calculateCompositeScore({ visualScore: 1, phoneticScore: 1, classOverlapScore: 1 }), 1);
  });

  it('classifies every rating boundary deterministically', () => {
    assert.equal(classifyCompositeScore(49), 'low');
    assert.equal(classifyCompositeScore(50), 'medium');
    assert.equal(classifyCompositeScore(74), 'medium');
    assert.equal(classifyCompositeScore(75), 'high');
    assert.equal(classifyCompositeScore(100), 'high');
  });

  it('rejects invalid component and composite scores', () => {
    for (const invalid of [undefined, null, '100', -1, 101, Number.NaN, Infinity, -Infinity]) {
      assert.throws(() => calculateCompositeScore({
        visualScore: invalid,
        phoneticScore: 50,
        classOverlapScore: 50,
      }), /finite number/);
      assert.throws(() => classifyCompositeScore(invalid), /finite number/);
    }
  });

  it('produces strong, labeled component evidence for exact marks with full class overlap', () => {
    const result = scoreConfusionRisk({ proposedMark, candidate: candidate() });
    assert.equal(result.visualScore, 100);
    assert.equal(result.phoneticScore, 100);
    assert.equal(result.classOverlapScore, 100);
    assert.equal(result.compositeScore, 100);
    assert.equal(result.compositeRating, 'high');
    assert.deepEqual(result.matchedMarkRefs, [
      { type: 'Visual', evidence: 'Normalized edit-distance similarity: 100/100.', score: 100 },
      { type: 'Phonetic', evidence: 'Soundex token similarity: 100/100.', score: 100 },
      { type: 'Class', evidence: 'Nice-class overlap: 9, 42 (100/100).', score: 100 },
    ]);
  });

  it('keeps similar marks without class overlap explainable', () => {
    const result = scoreConfusionRisk({
      proposedMark: { markText: 'Forge', niceClasses: [9] },
      candidate: candidate({ markText: 'Forg', niceClasses: [35] }),
    });
    assert.equal(result.visualScore, 80);
    assert.equal(result.phoneticScore, 100);
    assert.equal(result.classOverlap, false);
    assert.equal(result.classOverlapScore, 0);
    assert.equal(result.compositeScore, 72);
    assert.match(result.matchedMarkRefs[2].evidence, /none \(0\/100\)/);
  });

  it('does not let class overlap alone produce a High rating', () => {
    const result = scoreConfusionRisk({
      proposedMark: { markText: 'Alpha', niceClasses: [9] },
      candidate: candidate({ markText: 'Beta', niceClasses: [9] }),
    });
    assert.equal(result.classOverlapScore, 100);
    assert.notEqual(result.compositeRating, 'high');
  });

  it('always omits conceptual analysis and returns exactly three deterministically ordered evidence entries', () => {
    const result = scoreConfusionRisk({ proposedMark, candidate: candidate() });
    assert.equal(result.conceptualScore, null);
    assert.equal(result.matchedMarkRefs.length, 3);
    assert.deepEqual(result.matchedMarkRefs.map((entry) => entry.type), ['Visual', 'Phonetic', 'Class']);
  });

  it('lists numerically sorted intersecting classes and explicitly reports no overlap', () => {
    const overlapResult = scoreConfusionRisk({
      proposedMark: { markText: 'Forge', niceClasses: [42, 9, 9] },
      candidate: candidate({ niceClasses: [35, 42, 9] }),
    });
    assert.match(overlapResult.matchedMarkRefs[2].evidence, /9, 42/);

    const noOverlapResult = scoreConfusionRisk({
      proposedMark: { markText: 'Forge', niceClasses: [9] },
      candidate: candidate({ niceClasses: [35] }),
    });
    assert.match(noOverlapResult.matchedMarkRefs[2].evidence, /overlap: none/);
  });

  it('preserves the genuine registry reference without substituting the internal record ID', () => {
    const result = scoreConfusionRisk({ proposedMark, candidate: candidate() });
    assert.equal(result.candidateRecordId, 'internal-registry-row-17');
    assert.equal(result.candidateRef, 'US-98765432');
    assert.notEqual(result.candidateRef, result.candidateRecordId);
    assert.deepEqual(result.methodology.sourceAttribution, ['USPTO']);
  });

  it('validates mark, Nice-class, and provenance inputs', () => {
    assert.throws(() => scoreConfusionRisk({
      proposedMark: { markText: '---', niceClasses: [9] },
      candidate: candidate(),
    }), /empty/);
    assert.throws(() => scoreConfusionRisk({
      proposedMark,
      candidate: candidate({ niceClasses: [46] }),
    }), /1 through 45/);
    for (const key of ['recordId', 'sourceRegistry', 'sourceReferenceId']) {
      assert.throws(() => scoreConfusionRisk({
        proposedMark,
        candidate: candidate({ [key]: '   ' }),
      }), /non-empty/);
    }
  });

  it('does not mutate inputs and produces identical results on repeated execution', () => {
    const input = {
      proposedMark: { markText: '  Fórge Labs  ', niceClasses: [42, 9, 9] },
      candidate: candidate({ markText: 'Forge Labs', niceClasses: [9, 42, 42] }),
    };
    const original = structuredClone(input);
    const first = scoreConfusionRisk(input);
    const second = scoreConfusionRisk(input);
    assert.deepEqual(input, original);
    assert.deepEqual(first, second);
  });

  it('does not use or return Elasticsearch relevance, or make legal conclusions', () => {
    const result = scoreConfusionRisk({
      proposedMark,
      candidate: candidate({ elasticsearchScore: 99 }),
    });
    assert.ok(!Object.hasOwn(result, 'elasticsearchScore'));
    assert.ok(!JSON.stringify(result).match(/infringement|registration outcome|legal certainty/iu));
  });
});
