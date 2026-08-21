const WATCH_COLUMNS = `
  id, firm_id, portfolio_mark_id, owner_user_id, state, poll_interval_minutes,
  next_poll_at, last_polled_at, last_poll_status, last_error_code, created_at, updated_at`;

function timestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function watchFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    portfolioMarkId: row.portfolio_mark_id,
    ownerUserId: row.owner_user_id,
    state: row.state,
    pollIntervalMinutes: row.poll_interval_minutes,
    nextPollAt: timestamp(row.next_poll_at),
    lastPolledAt: timestamp(row.last_polled_at),
    lastPollStatus: row.last_poll_status,
    lastErrorCode: row.last_error_code,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function watchWhere(firmId, filters) {
  const values = [firmId];
  const clauses = ['firm_id = $1'];
  if (filters.state) { values.push(filters.state); clauses.push(`state = $${values.length}`); }
  if (filters.portfolioMarkId) { values.push(filters.portfolioMarkId); clauses.push(`portfolio_mark_id = $${values.length}`); }
  return { values, where: clauses.join(' AND ') };
}

export class WatchRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('WatchRepository needs a PostgreSQL pool-like database.');
    }
    this.database = database;
  }

  async portfolioMarkExists({ firmId, portfolioMarkId }) {
    const result = await this.database.query(
      'SELECT id FROM portfolio_marks WHERE firm_id = $1 AND id = $2', [firmId, portfolioMarkId],
    );
    return result.rowCount > 0;
  }

  async create({ firmId, actorUserId, input, nextPollAt }) {
    const result = await this.database.query(
      `INSERT INTO watches (
        firm_id, portfolio_mark_id, owner_user_id, state, poll_interval_minutes, next_poll_at
      ) VALUES (
        $1, $2, (SELECT id FROM users WHERE supabase_user_id = $3 AND firm_id = $1), $4, $5, $6
      ) RETURNING ${WATCH_COLUMNS}`,
      [firmId, input.portfolioMarkId, actorUserId, input.state, input.pollIntervalMinutes, nextPollAt],
    );
    return result.rowCount ? watchFromRow(result.rows[0]) : null;
  }

  async list({ firmId, filters, pagination }) {
    const { values, where } = watchWhere(firmId, filters);
    const counted = await this.database.query(`SELECT count(*)::integer AS total FROM watches WHERE ${where}`, values);
    const pageValues = [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize];
    const listed = await this.database.query(
      `SELECT ${WATCH_COLUMNS} FROM watches WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return { items: listed.rows.map(watchFromRow), total: counted.rows[0].total };
  }

  async get({ firmId, watchId }) {
    const result = await this.database.query(
      `SELECT ${WATCH_COLUMNS} FROM watches WHERE firm_id = $1 AND id = $2`, [firmId, watchId],
    );
    return result.rowCount ? watchFromRow(result.rows[0]) : null;
  }

  async update({ firmId, watchId, input }) {
    const names = { state: 'state', pollIntervalMinutes: 'poll_interval_minutes', nextPollAt: 'next_poll_at' };
    const values = [firmId, watchId];
    const assignments = Object.entries(input).map(([field, value]) => {
      values.push(value);
      return `${names[field]} = $${values.length}`;
    });
    const result = await this.database.query(
      `UPDATE watches SET ${assignments.join(', ')}, updated_at = now()
       WHERE firm_id = $1 AND id = $2 RETURNING ${WATCH_COLUMNS}`,
      values,
    );
    return result.rowCount ? watchFromRow(result.rows[0]) : null;
  }

  async delete({ firmId, watchId }) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'DELETE FROM watches WHERE firm_id = $1 AND id = $2 RETURNING id', [firmId, watchId],
      );
      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async withDueWatchBatch({ now, limit, handleWatch }) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const due = await client.query(
        `SELECT ${WATCH_COLUMNS} FROM watches
         WHERE state = 'enabled' AND next_poll_at IS NOT NULL AND next_poll_at <= $1
         ORDER BY next_poll_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [now, limit],
      );
      for (const row of due.rows) {
        const watch = watchFromRow(row);
        const resolution = await handleWatch(watch);
        if (resolution?.advance === true) {
          await client.query(
            `UPDATE watches SET next_poll_at = $3, updated_at = now()
             WHERE firm_id = $1 AND id = $2`,
            [watch.firmId, watch.id, resolution.nextPollAt],
          );
        }
      }
      await client.query('COMMIT');
      return { selected: due.rowCount };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async loadForProcessing({ firmId, watchId }) {
    const result = await this.database.query(
      `SELECT w.*, p.id AS portfolio_id, p.firm_id AS portfolio_firm_id,
       p.mark_text AS portfolio_mark_text, p.jurisdiction AS portfolio_jurisdiction,
       p.nice_classes AS portfolio_nice_classes, p.source_registry AS portfolio_source_registry,
       p.registry_reference AS portfolio_registry_reference, p.status AS portfolio_status
       FROM watches w JOIN portfolio_marks p
         ON p.id = w.portfolio_mark_id AND p.firm_id = w.firm_id
       WHERE w.firm_id = $1 AND w.id = $2`,
      [firmId, watchId],
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      watch: watchFromRow(row),
      portfolioMark: {
        id: row.portfolio_id, firmId: row.portfolio_firm_id, markText: row.portfolio_mark_text,
        jurisdiction: row.portfolio_jurisdiction, niceClasses: [...row.portfolio_nice_classes],
        sourceRegistry: row.portfolio_source_registry,
        registryReference: row.portfolio_registry_reference, status: row.portfolio_status,
      },
    };
  }

  async recordPollOutcome({ firmId, watchId, polledAt, status, errorCode }) {
    await this.database.query(
      `UPDATE watches SET last_polled_at = $3, last_poll_status = $4, last_error_code = $5,
       updated_at = now() WHERE firm_id = $1 AND id = $2`,
      [firmId, watchId, polledAt, status, errorCode],
    );
  }
}
