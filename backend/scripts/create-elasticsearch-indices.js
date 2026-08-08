import { loadElasticsearchIndexConfig } from '../src/config.js';
import { ensureElasticsearchIndices } from '../src/search/elasticsearch-indices.js';

const config = loadElasticsearchIndexConfig();
const results = await ensureElasticsearchIndices({ baseUrl: config.elasticsearchUrl });
for (const result of results) {
  console.log(`Elasticsearch index ${result.name}: ${result.created ? 'created' : 'already exists'}.`);
}
