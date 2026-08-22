import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkerHeartbeat } from '../../src/operations/worker-heartbeat.js';

describe('worker heartbeat', () => {
  it('writes only a static worker key with bounded expiry', async () => {
    const calls = [];
    const heartbeat = new WorkerHeartbeat({
      redisClient: { async set(...args) { calls.push(args); } }, serviceName: 'watch', ttlSeconds: 120,
      clock: () => new Date('2026-08-22T00:00:00.000Z'),
    });
    await heartbeat.beat();
    assert.deepEqual(calls, [['worker:heartbeat:watch', '2026-08-22T00:00:00.000Z', { EX: 120 }]]);
    assert.throws(() => new WorkerHeartbeat({ redisClient: { set() {} }, serviceName: '../unsafe' }));
  });
});
