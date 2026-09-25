import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPool } from '../../src/db/pool.js';

describe('database pool resilience', () => {
  it('handles an unexpected idle-client error without leaving an unhandled error event', async () => {
    const recorded = [];
    const pool = createPool('postgres://user:password@127.0.0.1:5432/iprp', {
      logger: { error: (message, context) => recorded.push([message, context]) },
    });

    assert.equal(pool.listenerCount('error'), 1);
    assert.doesNotThrow(() => pool.emit('error', Object.assign(new Error('connection lost'), { code: 'ECONNRESET' })));
    assert.deepEqual(recorded, [[
      'Unexpected idle PostgreSQL client error.',
      { name: 'Error', code: 'ECONNRESET' },
    ]]);

    await pool.end();
  });
});
