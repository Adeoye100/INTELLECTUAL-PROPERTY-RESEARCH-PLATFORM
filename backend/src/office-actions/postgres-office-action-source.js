export class PostgresOfficeActionSource {
  constructor({ database, sourceName = 'USPTO', maximumResults = 25 } = {}) {
    if (!database || typeof database.query !== 'function') {
      throw new TypeError('PostgresOfficeActionSource requires a database connection with a query method.');
    }
    const name = typeof sourceName === 'string' ? sourceName.trim().toUpperCase() : '';
    if (!name || !/^[A-Z0-9_-]+$/.test(name)) {
      throw new TypeError('PostgresOfficeActionSource requires a valid sourceName.');
    }
    if (!Number.isSafeInteger(maximumResults) || maximumResults < 1 || maximumResults > 100) {
      throw new TypeError('PostgresOfficeActionSource maximumResults must be an integer between 1 and 100.');
    }
    this.database = database;
    this.sourceName = name;
    this.maximumResults = maximumResults;
  }

  async searchOfficeActions(query = {}) {
    const clauses = ['source_registry = $' + 1];
    const parameters = [this.sourceName];

    if (query.applicationNumber) {
      parameters.push(query.applicationNumber);
      clauses.push(`application_number ILIKE $${parameters.length}`);
    }

    if (query.markText) {
      parameters.push(`%${query.markText}%`);
      clauses.push(`mark_text ILIKE $${parameters.length}`);
    }

    if (query.owner) {
      parameters.push(`%${query.owner}%`);
      clauses.push(`owner ILIKE $${parameters.length}`);
    }

    if (query.filedFrom) {
      parameters.push(query.filedFrom);
      clauses.push(`office_action_date >= $${parameters.length}`);
    }

    if (query.filedTo) {
      parameters.push(query.filedTo);
      clauses.push(`office_action_date <= $${parameters.length}`);
    }

    if (Array.isArray(query.documentTypes) && query.documentTypes.length > 0) {
      parameters.push(query.documentTypes);
      clauses.push(`document_type = ANY($${parameters.length})`);
    }

    if (Array.isArray(query.jurisdictions) && query.jurisdictions.length > 0) {
      parameters.push(query.jurisdictions);
      clauses.push(`jurisdiction = ANY($${parameters.length})`);
    }

    const limit = Math.min(query.maxResults || this.maximumResults, this.maximumResults);
    parameters.push(limit);
    const limitIndex = parameters.length;

    const sql = `
      SELECT
        source_registry,
        source_reference_id,
        application_number,
        mark_text,
        owner,
        jurisdiction,
        document_type,
        office_action_date,
        examiner_name,
        examiner_reasoning_text,
        summary_method,
        source_document_url,
        source_metadata
      FROM office_action_documents
      WHERE ${clauses.join(' AND ')}
      ORDER BY office_action_date DESC NULLS LAST, id DESC
      LIMIT $${limitIndex}
    `;

    const result = await this.database.query(sql, parameters);
    return result.rows.map((row) => ({
      sourceRegistry: row.source_registry,
      sourceReferenceId: row.source_reference_id,
      applicationNumber: row.application_number ?? null,
      markText: row.mark_text ?? null,
      owner: row.owner ?? null,
      jurisdiction: row.jurisdiction ?? null,
      documentType: row.document_type,
      officeActionDate: row.office_action_date
        ? (row.office_action_date instanceof Date ? row.office_action_date.toISOString().slice(0, 10) : String(row.office_action_date).slice(0, 10))
        : null,
      examinerName: row.examiner_name ?? null,
      examinerReasoningSummary: row.examiner_reasoning_text ?? null,
      summaryMethod: row.summary_method ?? 'registry',
      sourceDocumentUrl: row.source_document_url ?? null,
      sourceMetadata: typeof row.source_metadata === 'object' && row.source_metadata !== null ? row.source_metadata : {},
    }));
  }
}
