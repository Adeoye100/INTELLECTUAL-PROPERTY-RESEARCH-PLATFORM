const SELECT_COLUMNS = `
  id, firm_id, portfolio_mark_id, source_registry, source_reference_id, application_number,
  document_type, office_action_date, examiner_name, examiner_reasoning_summary, summary_method,
  source_document_url, source_metadata, linked_by_user_id, created_at, updated_at`;

function dateValue(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function timestampValue(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function officeActionRefFromRow(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    portfolioMarkId: row.portfolio_mark_id,
    sourceRegistry: row.source_registry,
    sourceReferenceId: row.source_reference_id,
    applicationNumber: row.application_number,
    documentType: row.document_type,
    officeActionDate: dateValue(row.office_action_date),
    examinerName: row.examiner_name,
    examinerReasoningSummary: row.examiner_reasoning_summary,
    summaryMethod: row.summary_method,
    sourceDocumentUrl: row.source_document_url,
    sourceMetadata: row.source_metadata ?? {},
    linkedByUserId: row.linked_by_user_id,
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

function executor(repository, transaction) {
  return transaction ?? repository.database;
}

export class OfficeActionRefRepository {
  constructor(database) {
    if (!database || typeof database.query !== 'function' || typeof database.connect !== 'function') {
      throw new TypeError('OfficeActionRefRepository needs a PostgreSQL pool-like database.');
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

  async portfolioMarkExists({ firmId, portfolioMarkId, transaction = null }) {
    const result = await executor(this, transaction).query(
      'SELECT 1 FROM portfolio_marks WHERE firm_id = $1 AND id = $2',
      [firmId, portfolioMarkId],
    );
    return result.rowCount > 0;
  }

  async create({ firmId, actorUserId, portfolioMarkId, input, transaction = null }) {
    const result = await executor(this, transaction).query(
      `INSERT INTO office_action_refs (
        firm_id, portfolio_mark_id, source_registry, source_reference_id, application_number,
        document_type, office_action_date, examiner_name, examiner_reasoning_summary, summary_method,
        source_document_url, source_metadata, linked_by_user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        (SELECT id FROM users WHERE supabase_user_id = $13 AND firm_id = $1)
      ) RETURNING ${SELECT_COLUMNS}`,
      [
        firmId, portfolioMarkId, input.sourceRegistry, input.sourceReferenceId, input.applicationNumber,
        input.documentType, input.officeActionDate, input.examinerName,
        input.examinerReasoningSummary, input.summaryMethod, input.sourceDocumentUrl,
        input.sourceMetadata, actorUserId,
      ],
    );
    return result.rowCount ? officeActionRefFromRow(result.rows[0]) : null;
  }

  async list({ firmId, portfolioMarkId, pagination }) {
    const values = [firmId, portfolioMarkId, pagination.pageSize, (pagination.page - 1) * pagination.pageSize];
    const count = await this.database.query(
      'SELECT count(*)::integer AS total FROM office_action_refs WHERE firm_id = $1 AND portfolio_mark_id = $2',
      values.slice(0, 2),
    );
    const rows = await this.database.query(
      `SELECT ${SELECT_COLUMNS}
       FROM office_action_refs
       WHERE firm_id = $1 AND portfolio_mark_id = $2
       ORDER BY office_action_date DESC NULLS LAST, created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      values,
    );
    return { items: rows.rows.map(officeActionRefFromRow), total: count.rows[0].total };
  }

  async get({ firmId, portfolioMarkId, officeActionRefId, transaction = null }) {
    const result = await executor(this, transaction).query(
      `SELECT ${SELECT_COLUMNS}
       FROM office_action_refs
       WHERE firm_id = $1 AND portfolio_mark_id = $2 AND id = $3`,
      [firmId, portfolioMarkId, officeActionRefId],
    );
    return result.rowCount ? officeActionRefFromRow(result.rows[0]) : null;
  }

  async update({ firmId, portfolioMarkId, officeActionRefId, input, transaction = null }) {
    const columns = {
      applicationNumber: 'application_number', documentType: 'document_type', officeActionDate: 'office_action_date',
      examinerName: 'examiner_name', examinerReasoningSummary: 'examiner_reasoning_summary',
      summaryMethod: 'summary_method', sourceDocumentUrl: 'source_document_url', sourceMetadata: 'source_metadata',
    };
    const values = [firmId, portfolioMarkId, officeActionRefId];
    const assignments = Object.entries(input).map(([field, value]) => {
      values.push(value);
      return `${columns[field]} = $${values.length}`;
    });
    const result = await executor(this, transaction).query(
      `UPDATE office_action_refs
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE firm_id = $1 AND portfolio_mark_id = $2 AND id = $3
       RETURNING ${SELECT_COLUMNS}`,
      values,
    );
    return result.rowCount ? officeActionRefFromRow(result.rows[0]) : null;
  }

  async delete({ firmId, portfolioMarkId, officeActionRefId, transaction = null }) {
    const run = async (client) => {
      const result = await client.query(
        `DELETE FROM office_action_refs
         WHERE firm_id = $1 AND portfolio_mark_id = $2 AND id = $3
         RETURNING id`,
        [firmId, portfolioMarkId, officeActionRefId],
      );
      return result.rowCount > 0;
    };
    if (transaction) return run(transaction);
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const deleted = await run(client);
      await client.query('COMMIT');
      return deleted;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
