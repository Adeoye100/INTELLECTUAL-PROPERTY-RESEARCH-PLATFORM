import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSearchQuery } from '../../src/search/search-query.js';

function invalid(query, field = undefined) {
  assert.throws(
    () => parseSearchQuery(query),
    (error) => error.code === 'VALIDATION_ERROR'
      && error.status === 400
      && (field === undefined || error.details.field === field),
  );
}

describe('parseSearchQuery', () => {
  it('normalizes the complete query shape without mutating input', () => {
    const query = {
      mark: '  NIMBL  ',
      jurisdiction: ['us', 'EU', 'US'],
      class: '9, 42, 9',
      status: ' registered ',
      owner: '  Nimbl Ltd.  ',
      filedFrom: '2025-01-01',
      filedTo: '2026-02-28',
    };
    const original = structuredClone(query);
    assert.deepEqual(parseSearchQuery(query), {
      mark: 'NIMBL',
      jurisdictions: ['US', 'EU'],
      niceClasses: [9, 42],
      status: 'registered',
      owner: 'Nimbl Ltd.',
      filedFrom: '2025-01-01',
      filedTo: '2026-02-28',
    });
    assert.deepEqual(query, original);
  });

  it('accepts the two supported registry jurisdictions', () => {
    assert.deepEqual(parseSearchQuery({ mark: 'AB', jurisdiction: 'eu' }), {
      mark: 'AB', jurisdictions: ['EU'], niceClasses: [], status: null, owner: null,
      filedFrom: null, filedTo: null,
    });
    assert.deepEqual(parseSearchQuery({ mark: 'AB', jurisdiction: ['US', 'eu', 'US'] }).jurisdictions, ['US', 'EU']);
  });

  it('rejects jurisdictions outside USPTO and EUIPO scope', () => {
    for (const jurisdiction of ['GB', 'CA', 'AU', 'NG', 'JP']) {
      invalid({ mark: 'AB', jurisdiction }, 'jurisdiction');
    }
  });

  it('parses classes from 1 through 45 and deduplicates them', () => {
    assert.deepEqual(parseSearchQuery({ mark: 'AB', class: '1, 45, 1' }).niceClasses, [1, 45]);
    invalid({ mark: 'AB', class: '0,2' }, 'class');
    invalid({ mark: 'AB', class: '1,46' }, 'class');
    invalid({ mark: 'AB', class: ['1', '2'] }, 'class');
  });

  it('requires a trimmed mark between two and two hundred characters', () => {
    invalid({}, 'mark');
    invalid({ mark: ' A ' }, 'mark');
    invalid({ mark: 'x'.repeat(201) }, 'mark');
    invalid({ mark: ['AB'] }, 'mark');
  });

  it('restricts status and owner length', () => {
    invalid({ mark: 'AB', status: 'filed' }, 'status');
    invalid({ mark: 'AB', status: ['registered'] }, 'status');
    invalid({ mark: 'AB', owner: 'x'.repeat(201) }, 'owner');
    invalid({ mark: 'AB', owner: { value: 'owner' } }, 'owner');
  });

  it('validates strict calendar dates and their ordering', () => {
    invalid({ mark: 'AB', filedFrom: '2026-02-29' }, 'filedFrom');
    invalid({ mark: 'AB', filedTo: '2026/02/01' }, 'filedTo');
    invalid({ mark: 'AB', filedFrom: ['2026-01-01'] }, 'filedFrom');
    invalid({ mark: 'AB', filedFrom: '2026-03-01', filedTo: '2026-02-01' }, 'filedTo');
  });

  it('rejects unsupported, nested, role, tenant, risk, and snapshot parameters', () => {
    for (const parameter of ['resultId', 'role', 'firmId', 'sourceStatus', 'riskScore', 'userId']) {
      invalid({ mark: 'AB', [parameter]: 'forbidden' }, parameter);
    }
    invalid({ mark: 'AB', owner: { nested: true } }, 'owner');
    invalid({ mark: 'AB', unknown: 'value' }, 'unknown');
  });
});
