const RECORD_FIELDS = 10;

function placeholders(recordIndex) {
  const offset = recordIndex * RECORD_FIELDS;
  return `(${Array.from({ length: RECORD_FIELDS }, (_, index) => `$${offset + index + 1}`).join(', ')})`;
}

export class RegistryTrademarkRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async upsertBatch(records) {
    if (!records.length) return 0;
    const parameters = records.flatMap((record) => [
      record.sourceRegistry,
      record.sourceReferenceId,
      record.markText,
      record.owner,
      record.jurisdiction,
      record.niceClasses,
      record.status,
      record.rawStatusCode,
      record.filingDate,
      record.sourceUpdatedAt,
    ]);
    const values = records.map((_, index) => placeholders(index)).join(',\n');
    const result = await this.pool.query(`
      INSERT INTO registry_trademarks (
        source_registry,
        source_reference_id,
        mark_text,
        owner,
        jurisdiction,
        nice_classes,
        status,
        raw_status_code,
        filing_date,
        source_updated_at
      ) VALUES ${values}
      ON CONFLICT (source_registry, source_reference_id) DO UPDATE SET
        mark_text = EXCLUDED.mark_text,
        owner = EXCLUDED.owner,
        jurisdiction = EXCLUDED.jurisdiction,
        nice_classes = EXCLUDED.nice_classes,
        status = EXCLUDED.status,
        raw_status_code = EXCLUDED.raw_status_code,
        filing_date = EXCLUDED.filing_date,
        source_updated_at = EXCLUDED.source_updated_at,
        updated_at = now()
      WHERE (
        registry_trademarks.mark_text,
        registry_trademarks.owner,
        registry_trademarks.jurisdiction,
        registry_trademarks.nice_classes,
        registry_trademarks.status,
        registry_trademarks.raw_status_code,
        registry_trademarks.filing_date,
        registry_trademarks.source_updated_at
      ) IS DISTINCT FROM (
        EXCLUDED.mark_text,
        EXCLUDED.owner,
        EXCLUDED.jurisdiction,
        EXCLUDED.nice_classes,
        EXCLUDED.status,
        EXCLUDED.raw_status_code,
        EXCLUDED.filing_date,
        EXCLUDED.source_updated_at
      )
      RETURNING id
    `, parameters);
    return result.rowCount;
  }

  async pendingProjection(limit) {
    const result = await this.pool.query(`
      SELECT
        id,
        mark_text,
        owner,
        jurisdiction,
        nice_classes,
        status,
        filing_date,
        source_registry,
        updated_at
      FROM registry_trademarks
      WHERE elasticsearch_synced_at IS NULL
         OR elasticsearch_synced_at < updated_at
      ORDER BY updated_at, id
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async markProjected(rows) {
    if (!rows.length) return;
    const versions = JSON.stringify(rows.map(({ id, updated_at: updatedAt }) => ({ id, updatedAt })));
    await this.pool.query(`
      UPDATE registry_trademarks AS trademark
      SET elasticsearch_synced_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS projected(id uuid, "updatedAt" timestamptz)
      WHERE trademark.id = projected.id
        AND trademark.updated_at = projected."updatedAt"
    `, [versions]);
  }
}
