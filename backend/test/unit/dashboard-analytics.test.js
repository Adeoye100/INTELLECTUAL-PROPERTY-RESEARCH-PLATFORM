import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardAnalyticsRepository, DashboardAnalyticsService, normalizeDashboardRange } from '../../src/dashboard/dashboard-analytics.js';

test('dashboard analytics normalizes bounded ranges and rejects unknown values', () => {
  assert.deepEqual(normalizeDashboardRange(undefined), { key: '30d', days: 30 });
  assert.throws(() => normalizeDashboardRange('365d'), (error) => error.code === 'INVALID_DASHBOARD_RANGE');
});

test('dashboard analytics is firm-scoped and cache hit avoids database work', async () => {
  const calls = [];
  const payload = { generatedAt: '2026-08-22T00:00:00.000Z', range: '30d', portfolio: { total: 2, byRisk: [], byStatus: [], renewalsDueSoon: 0 }, watchActivity: { points: [], enabled: 1, disabled: 0 } };
  const redis = { async get(key) { calls.push(['get', key]); return key.includes('firm-a') ? JSON.stringify(payload) : null; }, async set(...args) { calls.push(['set', ...args]); } };
  const repository = { async aggregate() { calls.push(['db']); return payload; } };
  const service = new DashboardAnalyticsService({ repository, redisClient: redis });
  const hit = await service.get({ firmId: 'firm-a', range: '30d' });
  const miss = await service.get({ firmId: 'firm-b', range: '30d' });
  assert.equal(hit.cacheStatus, 'hit'); assert.equal(miss.cacheStatus, 'miss');
  assert.equal(calls.filter((call) => call[0] === 'db').length, 1);
  assert.match(calls[0][1], /firm-a/); assert.match(calls[1][1], /firm-b/);
});

test('repository uses parameterized firm filters and preserves partial poll counts', async () => {
  const queries = [];
  const database = { async query(sql, params) { queries.push([sql, params]); if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 1 }] }; if (sql.includes('GROUP BY status')) return { rows: [{ status: 'registered', count: 1 }] }; if (sql.includes('composite_rating')) return { rows: [{ rating: 'low', count: 1 }] }; if (sql.includes('renewal_date')) return { rows: [{ count: 0 }] }; if (sql.includes('GROUP BY state')) return { rows: [{ state: 'enabled', count: 1 }] }; if (sql.includes('last_polled_at')) return { rows: [{ day: '2026-08-22', polls: 1, partial: 1, unavailable: 0 }] }; return { rows: [{ day: '2026-08-22', alerts: 0 }] }; } };
  const result = await new DashboardAnalyticsRepository(database, { clock: () => new Date('2026-08-22T12:00:00Z') }).aggregate({ firmId: 'firm-a', days: 1 });
  assert.equal(result.portfolio.total, 1); assert.equal(result.watchActivity.points[0].partial, 1);
  assert.ok(queries.every(([, params]) => params[0] === 'firm-a'));
});
