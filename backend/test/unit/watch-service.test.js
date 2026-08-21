import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, unauthorized } from '../../src/errors.js';
import { loadConfig } from '../../src/config.js';
import { WatchRepository } from '../../src/watch/watch-repository.js';
import { RedisWatchIngestQueue, deterministicWatchJobId, validateWatchJob } from '../../src/watch/watch-ingest-queue.js';
import { WatchIngestProcessor } from '../../src/watch/watch-ingest-processor.js';
import { WatchScheduler } from '../../src/watch/watch-scheduler.js';
import { WatchService } from '../../src/watch/watch-service.js';
import { createWatchRuntime } from '../../src/watch/watch-runtime.js';
import { createWatchRouter } from '../../src/routes/watch-routes.js';

const firmId = '11111111-1111-4111-8111-111111111111';
const otherFirmId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const markId = '44444444-4444-4444-8444-444444444444';
const watchId = '55555555-5555-4555-8555-555555555555';
const scheduledFor = '2026-08-21T00:00:00.000Z';
const clock = () => new Date(scheduledFor);

const watch = Object.freeze({
  id: watchId, firmId, portfolioMarkId: markId, ownerUserId: userId, state: 'enabled',
  pollIntervalMinutes: 60, nextPollAt: scheduledFor, lastPolledAt: null, lastPollStatus: null,
  lastErrorCode: null, createdAt: scheduledFor, updatedAt: scheduledFor,
});

const createInput = Object.freeze({ portfolioMarkId: markId, state: 'enabled', pollIntervalMinutes: 60 });

function watchRepository(overrides = {}) {
  return {
    calls: [],
    async portfolioMarkExists(payload) { this.calls.push(['portfolioMarkExists', payload]); return true; },
    async create(payload) { this.calls.push(['create', payload]); return watch; },
    async list(payload) { this.calls.push(['list', payload]); return { items: [watch], total: 1 }; },
    async get(payload) { this.calls.push(['get', payload]); return watch; },
    async update(payload) { this.calls.push(['update', payload]); return { ...watch, ...payload.input }; },
    async delete(payload) { this.calls.push(['delete', payload]); return true; },
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    version: 1, jobId: deterministicWatchJobId(watchId, scheduledFor), watchId, firmId,
    portfolioMarkId: markId, scheduledFor, attempt: 0, ...overrides,
  };
}

function fakeRedis(overrides = {}) {
  const values = new Map();
  const list = [];
  return {
    values, list,
    async set(key, value, options) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value); return 'OK';
    },
    async lPush(_key, value) { list.unshift(value); return list.length; },
    async rPop() { return list.pop() ?? null; },
    async del(key) { values.delete(key); return 1; },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) === args[0]) { values.delete(keys[0]); return 1; }
      return 0;
    },
    ...overrides,
  };
}

describe('watch service and repository boundary', () => {
  it('creates, lists, gets, updates, deletes, scopes firm, and preserves inputs', async () => {
    const repo = watchRepository();
    const service = new WatchService({ repository: repo, defaultPollIntervalMinutes: 60, clock });
    assert.deepEqual(await service.createWatch({ firmId, actorUserId: userId, input: createInput }), watch);
    assert.deepEqual(await service.listWatches({ firmId, filters: {}, pagination: {} }), {
      items: [watch], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    assert.deepEqual(await service.getWatch({ firmId, watchId }), watch);
    assert.equal((await service.updateWatch({ firmId, watchId, input: { state: 'paused' } })).nextPollAt, null);
    await service.deleteWatch({ firmId, watchId });
    assert.equal(repo.calls.every(([, payload]) => payload.firmId === firmId), true);
    assert.deepEqual(createInput, { portfolioMarkId: markId, state: 'enabled', pollIntervalMinutes: 60 });
  });

  it('returns mark or watch 404 without revealing cross-firm records', async () => {
    const markMissing = new WatchService({ repository: watchRepository({ async portfolioMarkExists() { return false; } }), defaultPollIntervalMinutes: 60, clock });
    await assert.rejects(() => markMissing.createWatch({ firmId, actorUserId: userId, input: createInput }), { code: 'PORTFOLIO_MARK_NOT_FOUND' });
    const service = new WatchService({ repository: watchRepository({ async get() { return null; }, async update() { return null; }, async delete() { return false; } }), defaultPollIntervalMinutes: 60, clock });
    for (const operation of [
      () => service.getWatch({ firmId: otherFirmId, watchId }),
      () => service.updateWatch({ firmId: otherFirmId, watchId, input: { state: 'paused' } }),
      () => service.deleteWatch({ firmId: otherFirmId, watchId }),
    ]) await assert.rejects(operation, { code: 'WATCH_NOT_FOUND', status: 404 });
  });

  it('strictly rejects client firm IDs, mutable metadata, invalid state/interval/id, empty patches, and page bounds', async () => {
    const service = new WatchService({ repository: watchRepository(), defaultPollIntervalMinutes: 60, clock });
    const invalid = [
      () => service.createWatch({ firmId, actorUserId: userId, input: { ...createInput, firm_id: otherFirmId } }),
      () => service.createWatch({ firmId, actorUserId: userId, input: { ...createInput, state: 'active' } }),
      () => service.createWatch({ firmId, actorUserId: userId, input: { ...createInput, pollIntervalMinutes: 4 } }),
      () => service.getWatch({ firmId, watchId: 'bad' }),
      () => service.updateWatch({ firmId, watchId, input: {} }),
      () => service.updateWatch({ firmId, watchId, input: { nextPollAt: scheduledFor } }),
      () => service.listWatches({ firmId, filters: { firmId }, pagination: {} }),
      () => service.listWatches({ firmId, filters: {}, pagination: { pageSize: '101' } }),
    ];
    for (const operation of invalid) await assert.rejects(operation, { code: 'VALIDATION_ERROR' });
  });

  it('uses parameterized firm-scoped SQL, due locking, and deterministic list ordering', async () => {
    const calls = [];
    const row = {
      id: watchId, firm_id: firmId, portfolio_mark_id: markId, owner_user_id: userId, state: 'enabled',
      poll_interval_minutes: 60, next_poll_at: new Date(scheduledFor), last_polled_at: null,
      last_poll_status: null, last_error_code: null, created_at: new Date(scheduledFor), updated_at: new Date(scheduledFor),
    };
    const client = {
      async query(sql, values = []) { calls.push([sql, values]); if (sql.includes('SELECT')) return { rowCount: 1, rows: [row] }; return { rowCount: 1, rows: [] }; }, release() {},
    };
    const database = {
      async query(sql, values) {
        calls.push([sql, values]);
        if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ total: 1 }] };
        return { rowCount: 1, rows: [row] };
      }, async connect() { return client; },
    };
    const repo = new WatchRepository(database);
    await repo.list({ firmId, filters: { state: 'enabled', portfolioMarkId: null }, pagination: { page: 1, pageSize: 10 } });
    await repo.get({ firmId, watchId });
    await repo.update({ firmId, watchId, input: { state: 'paused', nextPollAt: null } });
    await repo.delete({ firmId, watchId });
    await repo.withDueWatchBatch({ now: scheduledFor, limit: 5, handleWatch: async () => ({ advance: true, nextPollAt: '2026-08-21T01:00:00.000Z' }) });
    const sql = calls.map(([statement]) => statement).join('\n');
    assert.match(sql, /WHERE firm_id = \$1 AND id = \$2/);
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /DELETE FROM watches WHERE firm_id = \$1 AND id = \$2/);
    assert.equal(sql.includes(firmId), false);
  });
});

describe('watch queue and scheduling', () => {
  it('validates versioned minimal jobs, creates deterministic IDs, deduplicates, and normalizes Redis failures', async () => {
    assert.equal(deterministicWatchJobId(watchId, scheduledFor), deterministicWatchJobId(watchId, scheduledFor));
    assert.deepEqual(validateWatchJob(job()), job());
    assert.throws(() => validateWatchJob({ ...job(), firmId: 'bad' }), { code: 'WATCH_JOB_INVALID' });
    const queue = new RedisWatchIngestQueue({ redisClient: fakeRedis() });
    assert.equal((await queue.enqueue(job())).enqueued, true);
    assert.equal((await queue.enqueue(job())).deduplicated, true);
    assert.deepEqual(await queue.dequeue(), job());
    const unavailable = new RedisWatchIngestQueue({ redisClient: fakeRedis({ async lPush() { throw new Error('redis password'); } }) });
    await assert.rejects(() => unavailable.enqueue(job()), { code: 'WATCH_QUEUE_UNAVAILABLE' });
  });

  it('schedules only bounded due watches, advances after enqueue, and isolates failures', async () => {
    const due = [watch, { ...watch, id: '66666666-6666-4666-8666-666666666666' }];
    const advanced = [];
    const repository = {
      async withDueWatchBatch({ limit, handleWatch }) {
        assert.equal(limit, 1);
        for (const item of due.slice(0, limit)) {
          const result = await handleWatch(item);
          if (result.advance) advanced.push(result.nextPollAt);
        }
        return { selected: 1 };
      },
    };
    const scheduler = new WatchScheduler({ repository, queue: { async enqueue() { return { enqueued: true, deduplicated: false }; } }, clock, batchSize: 1 });
    const summary = await scheduler.runOnce();
    assert.deepEqual(summary, { selected: 1, enqueued: 1, deduplicated: 0, advanced: 1, failures: [] });
    assert.deepEqual(advanced, ['2026-08-21T01:00:00.000Z']);
    const failed = new WatchScheduler({ repository, queue: { async enqueue() { throw new Error('down'); } }, clock, batchSize: 1 });
    assert.deepEqual((await failed.runOnce()).failures, ['WATCH_SCHEDULER_DATABASE_FAILED']);
    let enqueueCount = 0;
    const failuresDoNotBlockLaterWatches = new WatchScheduler({
      repository: {
        async withDueWatchBatch({ limit, handleWatch }) {
          assert.equal(limit, 2);
          const outcomes = await Promise.all(due.map(handleWatch));
          return { selected: outcomes.length };
        },
      },
      queue: {
        async enqueue() {
          enqueueCount += 1;
          if (enqueueCount === 1) throw new Error('temporary');
          return { enqueued: true, deduplicated: false };
        },
      }, clock, batchSize: 2,
    });
    const isolated = await failuresDoNotBlockLaterWatches.runOnce();
    assert.equal(isolated.enqueued, 1);
    assert.equal(isolated.advanced, 1);
    assert.equal(isolated.failures.length, 1);
  });
});

describe('watch ingest processor', () => {
  it('processes a valid job once, retains partial evidence, records outcome, and releases its lock', async () => {
    const updates = [];
    const locks = [];
    const queue = { async acquireProcessingLock() { return 'lock'; }, async releaseProcessingLock(...args) { locks.push(args); } };
    const repository = {
      async loadForProcessing() { return { watch, portfolioMark: { id: markId, firmId, markText: 'FORGE', jurisdiction: 'US', niceClasses: [9], sourceRegistry: 'USPTO', registryReference: '123' } }; },
      async recordPollOutcome(payload) { updates.push(payload); },
    };
    let searches = 0;
    const processor = new WatchIngestProcessor({ repository, queue, clock, searchService: { async search(query) { searches += 1; assert.deepEqual(query.niceClasses, [9]); return { requestId: 'request-1', partial: true, sourceStatuses: [{ source: 'USPTO', status: 'complete' }], results: [{ riskAnalysis: { compositeRating: 'high' } }] }; } } });
    const outcome = await processor.process(job());
    assert.equal(searches, 1);
    assert.equal(outcome.outcome, 'partial');
    assert.equal(outcome.polling.results[0].riskAnalysis.compositeRating, 'high');
    assert.deepEqual(updates[0], { firmId, watchId, polledAt: scheduledFor, status: 'partial', errorCode: null });
    assert.deepEqual(locks, [[job().jobId, 'lock']]);
  });

  it('skips invalid, duplicate, stale, and deleted jobs without searching and records sanitized failures', async () => {
    let searches = 0;
    const queue = { async acquireProcessingLock() { return null; }, async releaseProcessingLock() {} };
    const processor = new WatchIngestProcessor({ repository: { async loadForProcessing() { return null; }, async recordPollOutcome() {} }, queue, clock, searchService: { async search() { searches += 1; } } });
    assert.deepEqual(await processor.process({}), { outcome: 'skipped', code: 'WATCH_JOB_INVALID', retryable: false });
    assert.deepEqual(await processor.process(job()), { outcome: 'skipped', code: 'WATCH_JOB_DUPLICATE', retryable: false });
    assert.equal(searches, 0);
    const deleted = new WatchIngestProcessor({
      repository: { async loadForProcessing() { return null; }, async recordPollOutcome() {} },
      queue: { async acquireProcessingLock() { return 'token'; }, async releaseProcessingLock() {} }, clock,
      searchService: { async search() { searches += 1; } },
    });
    assert.deepEqual(await deleted.process(job()), { outcome: 'skipped', code: 'WATCH_NOT_FOUND', retryable: false });
    const updates = [];
    const failed = new WatchIngestProcessor({
      repository: { async loadForProcessing() { return { watch, portfolioMark: { id: markId, firmId, markText: 'FORGE', jurisdiction: 'US', niceClasses: [9] } }; }, async recordPollOutcome(payload) { updates.push(payload); } },
      queue: { async acquireProcessingLock() { return 'token'; }, async releaseProcessingLock() {} }, clock,
      searchService: { async search() { throw new Error('search credentials'); } },
    });
    assert.deepEqual(await failed.process(job()), { outcome: 'failed', code: 'WATCH_SEARCH_FAILED', retryable: true });
    assert.equal(updates[0].errorCode, 'WATCH_SEARCH_FAILED');
  });
});

describe('watch routes and feature configuration', () => {
  it('enforces read/write roles and mounts before route fallback', async () => {
    const calls = [];
    const identities = { admin: { userId, firmId, role: 'admin' }, attorney: { userId, firmId, role: 'attorney' }, viewer: { userId, firmId, role: 'viewer' } };
    const authenticate = (req, _res, next) => { const identity = identities[req.get('authorization')?.replace('Bearer ', '')]; if (!identity) return next(unauthorized()); req.auth = identity; return next(); };
    const service = { defaultPollIntervalMinutes: 60, async createWatch(payload) { calls.push(['create', payload]); return watch; }, async listWatches(payload) { calls.push(['list', payload]); return { items: [], pagination: {} }; }, async getWatch() { return watch; }, async updateWatch() { return watch; }, async deleteWatch() {} };
    const app = express(); app.use(express.json()); app.use('/api/v1', createWatchRouter(authenticate, service)); app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' })); app.use(errorHandler);
    assert.equal((await request(app).get('/api/v1/watches')).status, 401);
    for (const token of ['admin', 'attorney']) assert.equal((await request(app).post('/api/v1/watches').set('Authorization', token).send(createInput)).status, 201);
    assert.equal((await request(app).get('/api/v1/watches').set('Authorization', 'viewer')).status, 200);
    assert.equal((await request(app).post('/api/v1/watches').set('Authorization', 'viewer').send(createInput)).status, 403);
    assert.equal(calls[0][1].firmId, firmId);
  });

  it('strictly loads disabled defaults and constructs no watch runtime', () => {
    const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret', SUPABASE_JWT_VERIFICATION_MODE: 'jwks', SUPABASE_JWT_ALGORITHMS: 'ES256', DATABASE_URL: 'postgres://example', REDIS_URL: 'redis://example', JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes' });
    assert.equal(config.watchEnabled, false);
    assert.equal(config.watchSchedulerIntervalMs, 60_000);
    assert.equal(createWatchRuntime({ config }), null);
    assert.throws(() => loadConfig({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret', SUPABASE_JWT_VERIFICATION_MODE: 'jwks', SUPABASE_JWT_ALGORITHMS: 'ES256', DATABASE_URL: 'postgres://example', REDIS_URL: 'redis://example', JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes', WATCH_ENABLED: 'yes' }), /WATCH_ENABLED/);
    assert.throws(() => loadConfig({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret', SUPABASE_JWT_VERIFICATION_MODE: 'jwks', SUPABASE_JWT_ALGORITHMS: 'ES256', DATABASE_URL: 'postgres://example', REDIS_URL: 'redis://example', JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes', WATCH_ENABLED: 'true' }), /requires SEARCH_ENABLED/);
    assert.throws(() => loadConfig({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret', SUPABASE_JWT_VERIFICATION_MODE: 'jwks', SUPABASE_JWT_ALGORITHMS: 'ES256', DATABASE_URL: 'postgres://example', REDIS_URL: 'redis://example', JWT_ACCESS_SECRET: 'unit-test-secret-that-is-at-least-32-bytes', WATCH_SCHEDULER_BATCH_SIZE: '101' }), /WATCH_SCHEDULER_BATCH_SIZE/);
  });
});
