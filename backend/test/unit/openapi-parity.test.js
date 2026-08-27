import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expected = {
  '/healthz': ['get'], '/readyz': ['get'],
  '/api/v1/auth/invitations/{token}': ['get'], '/api/v1/auth/invitations/{token}/accept': ['post'],
  '/api/v1/provisioning/firm': ['post'], '/api/v1/me': ['get'], '/api/v1/admin/invitations': ['post'],
  '/api/v1/dashboard/analytics': ['get'],
  '/api/v1/search': ['get'], '/api/v1/search-results': ['get'], '/api/v1/search-results/{id}': ['get'], '/api/v1/office-actions/search': ['get'],
  '/api/v1/portfolio-marks': ['get', 'post'], '/api/v1/portfolio-marks/{id}': ['get', 'patch', 'delete'],
  '/api/v1/watches': ['get', 'post'], '/api/v1/watches/{id}': ['get', 'patch', 'delete'],
  '/api/v1/alerts': ['get'], '/api/v1/alerts/{id}': ['get', 'patch'], '/api/v1/audit-logs': ['get'], '/api/v1/users/{id}/role': ['patch'],
  '/api/v1/portfolio-marks/{portfolioMarkId}/office-action-refs': ['get', 'post'],
  '/api/v1/portfolio-marks/{portfolioMarkId}/office-action-refs/{id}': ['get', 'patch', 'delete'],
  '/api/v1/exports': ['get', 'post'], '/api/v1/exports/{id}': ['get'], '/api/v1/exports/{id}/download': ['get'],
};

describe('OpenAPI route parity', () => {
  it('documents every mounted route and no unmounted documented route', async () => {
    const document = JSON.parse(await readFile(path.join(root, 'openapi.json'), 'utf8'));
    assert.deepEqual(Object.keys(document.paths).sort(), Object.keys(expected).sort());
    for (const [route, methods] of Object.entries(expected)) {
      assert.deepEqual(Object.keys(document.paths[route]).filter((key) => ['get', 'post', 'patch', 'delete'].includes(key)).sort(), methods.sort(), route);
    }
  });

  it('marks feature-gated routes and documents safe bearer authentication', async () => {
    const document = JSON.parse(await readFile(path.join(root, 'openapi.json'), 'utf8'));
    assert.equal(document.paths['/api/v1/search'].get['x-featureGate'], 'SEARCH_ENABLED');
    assert.equal(document.paths['/api/v1/office-actions/search'].get['x-featureGate'], 'OFFICE_ACTION_SEARCH_ENABLED');
    assert.equal(document.paths['/api/v1/exports'].get['x-featureGate'], 'PDF_EXPORT_ENABLED');
    assert.equal(document.components.securitySchemes.bearerAuth.scheme, 'bearer');
  });
});
