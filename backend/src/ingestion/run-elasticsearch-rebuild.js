import { loadElasticsearchRebuildConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { rebuildRegistryTrademarksInElasticsearch } from './elasticsearch-rebuild.js';
import { RegistryTrademarkRepository } from './registry-trademark-repository.js';

const config = loadElasticsearchRebuildConfig();
const pool = createPool(config.databaseUrl, config);

try {
  const repository = new RegistryTrademarkRepository(pool);
  const result = await rebuildRegistryTrademarksInElasticsearch({
    repository,
    baseUrl: config.elasticsearchUrl,
    indexName: config.rebuildIndex,
  });
  console.log('Elasticsearch registry rebuild complete', result);
  console.log(`Cutover requires setting ELASTICSEARCH_INDEX=${config.rebuildIndex} and redeploying the API and refresh worker.`);
} finally {
  await pool.end();
}
