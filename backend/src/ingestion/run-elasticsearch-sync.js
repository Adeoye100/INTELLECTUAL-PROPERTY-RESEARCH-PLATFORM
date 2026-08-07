import { loadElasticsearchSyncConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import {
  ElasticsearchProjector,
  syncRegistryTrademarksToElasticsearch,
} from './elasticsearch-projector.js';
import { RegistryTrademarkRepository } from './registry-trademark-repository.js';

const config = loadElasticsearchSyncConfig();
const pool = createPool(config.databaseUrl);
try {
  const repository = new RegistryTrademarkRepository(pool);
  const projector = new ElasticsearchProjector({
    baseUrl: config.elasticsearchUrl,
    indexName: config.elasticsearchIndex,
  });
  const result = await syncRegistryTrademarksToElasticsearch({ repository, projector });
  console.log('Elasticsearch projection complete', result);
} finally {
  await pool.end();
}
