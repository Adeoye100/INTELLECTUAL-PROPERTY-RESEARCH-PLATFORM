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
  if (body.riskScoreSnapshot !== undefined || body.candidateMarkText !== undefined) {
    throw badRequest('VALIDATION_ERROR', 'Client-supplied risk scores and candidate mark text are not permitted.');
  }
  const searchId = typeof body.searchId === 'string' ? body.searchId.trim() : '';
  if (!searchId) {
    throw badRequest('VALIDATION_ERROR', 'searchId is required.', { field: 'searchId' });
  }
  const candidateResultId = typeof body.candidateResultId === 'string' ? body.candidateResultId.trim() : (typeof body.resultId === 'string' ? body.resultId.trim() : '');
  if (!candidateResultId) {
    throw badRequest('VALIDATION_ERROR', 'candidateResultId is required.', { field: 'candidateResultId' });
  }

  return { searchId, candidateResultId };
}
