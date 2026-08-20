import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreConfusionRisk } from '../../src/risk/confusion-risk.js';
import { RiskEnrichedSearchService } from '../../src/risk/risk-enriched-search-service.js';
import {
  SYNTHETIC_CONFUSION_RISK_FIXTURE_NOTICE,
  SYNTHETIC_CONFUSION_RISK_PAIRS,
} from '../fixtures/confusion-risk-pairs.js';

function fixture(label) {
  return SYNTHETIC_CONFUSION_RISK_PAIRS.find((pair) => pair.label === label);
}

describe('BE-10 provisional synthetic confusion-risk calibration fixtures', () => {
  it('are explicitly synthetic and non-authoritative', () => {
    assert.match(SYNTHETIC_CONFUSION_RISK_FIXTURE_NOTICE, /Synthetic and non-authoritative/);
  });

  it('preserves expected provisional ratings for deterministic synthetic pairs', () => {
    for (const pair of SYNTHETIC_CONFUSION_RISK_PAIRS.filter(({ expectedRating }) => expectedRating)) {
      const result = scoreConfusionRisk(pair);
      assert.equal(result.compositeRating, pair.expectedRating, pair.label);
      assert.equal(result.methodology.version, 'confusion-risk-v1.0.0-provisional');
    }
  });

  it('covers documented phonetic, partial-class, and provenance behavior', () => {
    const duplicateTokens = scoreConfusionRisk(fixture('duplicate-token phonetic comparison'));
    const partialClasses = scoreConfusionRisk(fixture('multi-class partial overlap'));
    const provenance = scoreConfusionRisk(fixture('candidate provenance preservation'));
    assert.equal(duplicateTokens.phoneticScore, 67);
    assert.equal(partialClasses.classOverlapScore, 67);
    assert.equal(provenance.candidateRef, 'EU-SYN-009');
    assert.equal(provenance.candidateSource, 'EUIPO');
  });

  it('keeps enriched ordering stable when the candidate order changes', async () => {
    const candidates = [
      { recordId: 'candidate-z', markText: 'Forge', niceClasses: [9], sourceRegistry: 'USPTO', sourceReferenceId: 'Z', relevanceScore: null },
      { recordId: 'candidate-a', markText: 'Forge', niceClasses: [9], sourceRegistry: 'EUIPO', sourceReferenceId: 'A', relevanceScore: null },
    ];
    const serviceFor = (results) => new RiskEnrichedSearchService({
      searchService: { async search() { return { results, sourceStatuses: [], partial: false, requestId: 'synthetic-order' }; } },
    });
    const first = await serviceFor(candidates).search({ mark: 'Forge', niceClasses: [9] });
    const second = await serviceFor([...candidates].reverse()).search({ mark: 'Forge', niceClasses: [9] });
    assert.deepEqual(first.results.map(({ recordId }) => recordId), ['candidate-a', 'candidate-z']);
    assert.deepEqual(second.results.map(({ recordId }) => recordId), ['candidate-a', 'candidate-z']);
  });
});
