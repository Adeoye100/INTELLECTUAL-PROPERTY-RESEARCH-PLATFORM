export async function ingestRegistryRecords({
  records,
  repository,
  batchSize = 500,
  recordFilter = () => true,
}) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new TypeError('batchSize must be a positive integer.');
  }
  if (typeof recordFilter !== 'function') {
    throw new TypeError('recordFilter must be a function.');
  }

  let processed = 0;
  let retained = 0;
  let changed = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    changed += await repository.upsertBatch(batch);
    batch = [];
  };

  for await (const record of records) {
    processed += 1;
    if (!recordFilter(record)) continue;
    retained += 1;
    batch.push(record);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return { processed, retained, changed };
}

export async function ingestRegistryUpdates({
  adapter,
  repository,
  since,
  batchSize = 500,
  recordFilter = () => true,
}) {
  const result = await ingestRegistryRecords({
    records: adapter.fetchUpdates(since),
    repository,
    batchSize,
    recordFilter,
  });
  return { sourceName: adapter.sourceName, ...result };
}
