export async function ingestRegistryUpdates({
  adapter,
  repository,
  since,
  batchSize = 500,
}) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new TypeError('batchSize must be a positive integer.');
  }

  let processed = 0;
  let changed = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    changed += await repository.upsertBatch(batch);
    processed += batch.length;
    batch = [];
  };

  for await (const record of adapter.fetchUpdates(since)) {
    batch.push(record);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return { sourceName: adapter.sourceName, processed, changed };
}
