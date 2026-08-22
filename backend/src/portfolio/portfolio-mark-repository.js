const SELECT_COLUMNS = `
  id, firm_id, owner_user_id, mark_text, jurisdiction, source_registry,
  registry_reference, nice_classes, status, filing_date, registration_date,
  renewal_date, created_at, updated_at`;

function dateValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function timestampValue(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function portfolioMarkFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    ownerUserId: row.owner_user_id,
    markText: row.mark_text,
    jurisdiction: row.jurisdiction,
    sourceRegistry: row.source_registry,
    registryReference: row.registry_reference,
    niceClasses: [...row.nice_classes],
    status: row.status,
    filingDate: dateValue(row.filing_date),
    registrationDate: dateValue(row.registration_date),
    renewalDate: dateValue(row.renewal_date),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

function whereForFilters({ firmId, filters }) {
  const values = [firmId];
  const clauses = ['firm_id = $1'];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.status) add('status = ?', filters.status);
  if (filters.jurisdiction) add('jurisdiction = ?', filters.jurisdiction);
  if (filters.sourceRegistry) add('source_registry = ?', filters.sourceRegistry);
  if (filters.registryReference) add('registry_reference = ?', filters.registryReference);
  if (filters.niceClass) add('? = ANY(nice_classes)', filters.niceClass);
  if (filters.renewalBefore) add('renewal_date <= ?', filters.renewalBefore);
  if (filters.renewalAfter) add('renewal_date >= ?', filters.renewalAfter);
  return { clauses, values };
}

function executor(repository, transaction) {
  return transaction ?? repository.database;
}

export class PortfolioMarkRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('PortfolioMarkRepository needs a PostgreSQL pool-like database.');
    }
    this.database = database;
  }

  async withTransaction(work) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async create({ firmId, actorUserId, input, transaction = null }) {
    const result = await executor(this, transaction).query(
      `INSERT INTO portfolio_marks (
        firm_id, owner_user_id, mark_text, jurisdiction, source_registry, registry_reference,
        nice_classes, status, filing_date, registration_date, renewal_date
      ) VALUES (
        $1,
        (SELECT id FROM users WHERE supabase_user_id = $2 AND firm_id = $1),
        $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING ${SELECT_COLUMNS}`,
      [
        firmId, actorUserId, input.markText, input.jurisdiction, input.sourceRegistry,
        input.registryReference, input.niceClasses, input.status, input.filingDate,
        input.registrationDate, input.renewalDate,
      ],
    );
    return portfolioMarkFromRow(result.rows[0]);
  }

  async list({ firmId, filters, pagination }) {
    const { clauses, values } = whereForFilters({ firmId, filters });
    const where = clauses.join(' AND ');
    const countResult = await this.database.query(
      `SELECT count(*)::integer AS total FROM portfolio_marks WHERE ${where}`,
      values,
    );
    const pageValues = [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize];
    const rowsResult = await this.database.query(
      `SELECT ${SELECT_COLUMNS}
       FROM portfolio_marks
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return {
      items: rowsResult.rows.map(portfolioMarkFromRow),
      total: countResult.rows[0].total,
    };
  }

  async get({ firmId, portfolioMarkId, transaction = null }) {
    const result = await executor(this, transaction).query(
      `SELECT ${SELECT_COLUMNS}
       FROM portfolio_marks
       WHERE firm_id = $1 AND id = $2`,
      [firmId, portfolioMarkId],
    );
    return result.rowCount ? portfolioMarkFromRow(result.rows[0]) : null;
  }

  async update({ firmId, portfolioMarkId, input, transaction = null }) {
    const columns = {
      markText: 'mark_text', jurisdiction: 'jurisdiction', sourceRegistry: 'source_registry',
      registryReference: 'registry_reference', niceClasses: 'nice_classes', status: 'status',
      filingDate: 'filing_date', registrationDate: 'registration_date', renewalDate: 'renewal_date',
    };
    const values = [firmId, portfolioMarkId];
    const assignments = Object.entries(input).map(([field, value]) => {
      values.push(value);
      return `${columns[field]} = $${values.length}`;
    });
    const result = await executor(this, transaction).query(
      `UPDATE portfolio_marks
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE firm_id = $1 AND id = $2
       RETURNING ${SELECT_COLUMNS}`,
      values,
    );
    return result.rowCount ? portfolioMarkFromRow(result.rows[0]) : null;
  }

  async delete({ firmId, portfolioMarkId, transaction = null }) {
    if (transaction) {
      const result = await transaction.query(
        'DELETE FROM portfolio_marks WHERE firm_id = $1 AND id = $2 RETURNING id',
        [firmId, portfolioMarkId],
      );
      return result.rowCount > 0;
    }
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'DELETE FROM portfolio_marks WHERE firm_id = $1 AND id = $2 RETURNING id',
        [firmId, portfolioMarkId],
      );
      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
