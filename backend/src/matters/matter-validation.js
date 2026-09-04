import { badRequest } from '../errors.js';

export function parseMatterCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('VALIDATION_ERROR', 'Matter input must be an object.');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : (typeof body.newMatterName === 'string' ? body.newMatterName.trim() : '');
  if (!name || name.length > 200) {
    throw badRequest('VALIDATION_ERROR', 'Matter name must be between 1 and 200 characters.', { field: 'name' });
  }
  const clientRef = typeof body.clientRef === 'string' ? body.clientRef.trim() : (typeof body.newMatterClientRef === 'string' ? body.newMatterClientRef.trim() : '');
  if (clientRef.length > 100) {
    throw badRequest('VALIDATION_ERROR', 'clientRef must be at most 100 characters.', { field: 'clientRef' });
  }
  return { name, clientRef };
}

export function parseMatterRiskResultCreate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('VALIDATION_ERROR', 'Risk result input must be an object.');
  }
  const candidateMarkText = typeof body.candidateMarkText === 'string' ? body.candidateMarkText.trim() : '';
  if (!candidateMarkText) {
    throw badRequest('VALIDATION_ERROR', 'candidateMarkText is required.', { field: 'candidateMarkText' });
  }
  const riskScoreSnapshot = body.riskScoreSnapshot && typeof body.riskScoreSnapshot === 'object' ? body.riskScoreSnapshot : null;
  if (!riskScoreSnapshot) {
    throw badRequest('VALIDATION_ERROR', 'riskScoreSnapshot is required.', { field: 'riskScoreSnapshot' });
  }
  const searchResultId = typeof body.resultId === 'string' ? body.resultId.trim() : (typeof body.searchResultId === 'string' ? body.searchResultId.trim() : null);

  return { candidateMarkText, riskScoreSnapshot, searchResultId };
}
