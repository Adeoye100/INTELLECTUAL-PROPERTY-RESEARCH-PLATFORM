import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MatterService } from '../../src/matters/matter-service.js';
import { parseMatterCreate, parseMatterRiskResultCreate } from '../../src/matters/matter-validation.js';
import { AppError } from '../../src/errors.js';

describe('Matter validation & server-authoritative persistence', () => {
  it('parses valid matter creation body', () => {
    const parsed = parseMatterCreate({ name: 'Clearance Case 1', clientRef: 'REF-100' });
    assert.deepEqual(parsed, { name: 'Clearance Case 1', clientRef: 'REF-100' });
  });

  it('rejects matter creation with empty name', () => {
    assert.throws(
      () => parseMatterCreate({ name: '   ' }),
      (err) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
    );
  });

  it('parses valid risk result payload requiring searchId and candidateResultId', () => {
    const parsed = parseMatterRiskResultCreate({
      searchId: '11111111-1111-1111-1111-111111111111',
      candidateResultId: 'c-123',
    });
    assert.deepEqual(parsed, {
      searchId: '11111111-1111-1111-1111-111111111111',
      candidateResultId: 'c-123',
    });
  });

  it('rejects payload with client-supplied riskScoreSnapshot or candidateMarkText with 400 badRequest', () => {
    assert.throws(
      () => parseMatterRiskResultCreate({
        searchId: '11111111-1111-1111-1111-111111111111',
        candidateResultId: 'c-123',
        riskScoreSnapshot: { compositeRating: 'low' },
      }),
      (err) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
    );

    assert.throws(
      () => parseMatterRiskResultCreate({
        searchId: '11111111-1111-1111-1111-111111111111',
        candidateResultId: 'c-123',
        candidateMarkText: 'FORGE TEK',
      }),
      (err) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
    );
  });

  it('rejects payload missing searchId or candidateResultId', () => {
    assert.throws(
      () => parseMatterRiskResultCreate({ candidateResultId: 'c-123' }),
      (err) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
    );

    assert.throws(
      () => parseMatterRiskResultCreate({ searchId: '11111111-1111-1111-1111-111111111111' }),
      (err) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
    );
  });

  it('saveRiskResult loads search snapshot from SearchResultService and persists derived risk evidence', async () => {
    const mockMatter = { id: 'm-1', firmId: 'firm-1', name: 'Matter 1', clientRef: 'C1' };
    const mockRepository = {
      findById: async ({ firmId, id }) => {
        if (firmId === 'firm-1' && id === 'm-1') return mockMatter;
        return null;
      },
      addRiskResult: async ({ firmId, matterId, createdByUserId, searchResultId, candidateMarkText, riskScoreSnapshot }) => ({
        id: 'rr-1',
        matterId,
        firmId,
        createdByUserId,
        searchResultId,
        candidateMarkText,
        riskScoreSnapshot,
      }),
    };

    const mockSearchResultService = {
      getSearchResult: async ({ firmId, searchResultId }) => {
        if (firmId === 'firm-1' && searchResultId === 's-1') {
          return {
            id: 's-1',
            results: [
              {
                id: 'c-100',
                candidateMarkText: 'SERVER DERIVED MARK',
                riskAnalysis: {
                  compositeRating: 'high',
                  phoneticScore: 90,
                  visualScore: 80,
                  conceptualScore: null,
                  classOverlap: true,
                  matchedMarkRefs: [],
                },
              },
            ],
          };
        }
        throw new AppError(404, 'SEARCH_RESULT_NOT_FOUND', 'Search result not found.');
      },
    };

    const service = new MatterService(mockRepository, { searchResultService: mockSearchResultService });

    const result = await service.saveRiskResult({
      firmId: 'firm-1',
      matterId: 'm-1',
      createdByUserId: 'u-1',
      input: {
        searchId: 's-1',
        candidateResultId: 'c-100',
      },
    });

    assert.equal(result.savedResult.candidateMarkText, 'SERVER DERIVED MARK');
    assert.equal(result.savedResult.riskScoreSnapshot.compositeRating, 'high');
    assert.equal(result.savedResult.searchResultId, 's-1');
  });

  it('saveRiskResult throws 404 if matter is not found or belongs to another firm', async () => {
    const mockRepository = { findById: async () => null };
    const service = new MatterService(mockRepository, { searchResultService: {} });

    await assert.rejects(
      () => service.saveRiskResult({
        firmId: 'firm-other',
        matterId: 'm-1',
        createdByUserId: 'u-1',
        input: { searchId: 's-1', candidateResultId: 'c-1' },
      }),
      (err) => err instanceof AppError && err.status === 404 && err.code === 'MATTER_NOT_FOUND',
    );
  });

  it('saveRiskResult throws 404 if search snapshot belongs to another firm or does not exist', async () => {
    const mockMatter = { id: 'm-1', firmId: 'firm-1', name: 'Matter 1' };
    const mockRepository = { findById: async () => mockMatter };
    const mockSearchResultService = {
      getSearchResult: async () => { throw new AppError(404, 'SEARCH_RESULT_NOT_FOUND', 'Search result not found.'); },
    };
    const service = new MatterService(mockRepository, { searchResultService: mockSearchResultService });

    await assert.rejects(
      () => service.saveRiskResult({
        firmId: 'firm-1',
        matterId: 'm-1',
        createdByUserId: 'u-1',
        input: { searchId: 's-cross-tenant', candidateResultId: 'c-1' },
      }),
      (err) => err instanceof AppError && err.status === 404 && err.code === 'SEARCH_RESULT_NOT_FOUND',
    );
  });

  it('saveRiskResult throws 404 if candidate is not in search snapshot results', async () => {
    const mockMatter = { id: 'm-1', firmId: 'firm-1', name: 'Matter 1' };
    const mockRepository = { findById: async () => mockMatter };
    const mockSearchResultService = {
      getSearchResult: async () => ({ id: 's-1', results: [] }),
    };
    const service = new MatterService(mockRepository, { searchResultService: mockSearchResultService });

    await assert.rejects(
      () => service.saveRiskResult({
        firmId: 'firm-1',
        matterId: 'm-1',
        createdByUserId: 'u-1',
        input: { searchId: 's-1', candidateResultId: 'c-missing' },
      }),
      (err) => err instanceof AppError && err.status === 404 && err.code === 'CANDIDATE_RESULT_NOT_FOUND',
    );
  });
});
