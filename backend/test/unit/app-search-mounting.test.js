import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { unauthorized } from '../../src/errors.js';

function createTestApp(searchService = null) {
  const authenticate = (request, _response, next) => {
    if (request.get('authorization') !== 'Bearer admin-token') return next(unauthorized());
    request.auth = { userId: 'user-1', email: 'admin@example.test', role: 'admin', firmId: 'firm-1' };
    return next();
  };
  return createApp({
    authenticate,
    authenticateIdentity: authenticate,
    searchService,
    authService: { async invitationDetails() {}, async acceptInvitation() {}, async issueInvitation() {} },
    provisioningService: { async provisionFirm() {} },
  });
}

describe('application search mounting', () => {
  it('returns 404 for search while disabled and keeps protected routes functional', async () => {
    const app = createTestApp();
    const search = await request(app).get('/api/v1/search?mark=NIMBL');
    const me = await request(app).get('/api/v1/me').set('Authorization', 'Bearer admin-token');
    assert.equal(search.status, 404);
    assert.equal(me.status, 200);
  });

  it('mounts enabled search and keeps it authenticated', async () => {
    const app = createTestApp({
      async search() {
        return {
          results: [{ recordId: '1', markText: 'NIMBL', sourceRegistry: 'USPTO', sourceReferenceId: '123', owner: null, jurisdiction: 'US', niceClasses: [9], filingDate: null, status: 'registered' }],
          sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }, { source: 'EUIPO', status: 'unavailable', resultCount: 0 }],
          partial: true,
          requestId: 'request-1',
        };
      },
    });
    const unauthenticated = await request(app).get('/api/v1/search?mark=NIMBL');
    const response = await request(app).get('/api/v1/search?mark=NIMBL').set('Authorization', 'Bearer admin-token');
    assert.equal(unauthenticated.status, 401);
    assert.equal(response.status, 200);
    assert.equal(response.body.results[0].candidateRef, '123');
    assert.deepEqual(response.body.sourceStatuses, [{ source: 'USPTO', status: 'complete', resultCount: 1 }, { source: 'EUIPO', status: 'unavailable', resultCount: 0 }]);
    assert.equal(response.body.partial, true);
  });
});
