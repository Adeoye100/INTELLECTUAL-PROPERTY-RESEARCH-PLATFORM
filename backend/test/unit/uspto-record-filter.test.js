import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRetainUsptoRecord } from '../../src/ingestion/uspto-record-filter.js';

describe('USPTO record retention policy', () => {
  it('retains normalized active USPTO statuses without changing Nice Classes', () => {
    const record = {
      status: 'registered',
      niceClasses: [9, 35, 42],
    };

    assert.equal(shouldRetainUsptoRecord(record), true);
    assert.equal(shouldRetainUsptoRecord({ status: 'pending', niceClasses: [] }), true);
  });

  it('drops normalized inactive statuses while ignoring class values for the current policy', () => {
    assert.equal(shouldRetainUsptoRecord({ status: 'cancelled', niceClasses: [9] }), false);
    assert.equal(shouldRetainUsptoRecord({ status: 'abandoned', niceClasses: [42] }), false);
  });

  it('retains a LIVE record with no Nice Classes', () => {
    assert.equal(shouldRetainUsptoRecord({ status: 'pending', niceClasses: [] }), true);
  });

  it('rejects malformed records instead of retaining them', () => {
    assert.equal(shouldRetainUsptoRecord(null), false);
    assert.equal(shouldRetainUsptoRecord({ niceClasses: [42] }), false);
  });
});
