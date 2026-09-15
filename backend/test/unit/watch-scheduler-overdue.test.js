import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WatchScheduler } from '../../src/watch/watch-scheduler.js';

const now = new Date('2026-09-15T19:30:00.000Z');

describe('WatchScheduler overdue cadence', () => {
  it('advances an overdue watch from the current scheduler time instead of replaying historical intervals', async () => {
    let nextPollAt = null;
    const watch = {
      id: '11111111-1111-4111-8111-111111111111',
      firmId: '22222222-2222-4222-8222-222222222222',
      portfolioMarkId: '33333333-3333-4333-8333-333333333333',
      nextPollAt: '2026-09-10T09:00:00.000Z',
      pollIntervalMinutes: 1440,
    };
    const repository = {
      async withDueWatchBatch({ handleWatch }) {
        const resolution = await handleWatch(watch);
        nextPollAt = resolution.nextPollAt;
        return { selected: 1 };
      },
    };
    const scheduler = new WatchScheduler({
      repository,
      queue: { async enqueue() { return { enqueued: true, deduplicated: false }; } },
      clock: () => new Date(now),
      batchSize: 1,
    });

    const summary = await scheduler.runOnce();

    assert.equal(summary.enqueued, 1);
    assert.equal(nextPollAt, '2026-09-16T19:30:00.000Z');
  });
});
