import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi.json');
const document = JSON.parse(await readFile(file, 'utf8'));
if (document.openapi !== '3.1.0' || !document.components?.securitySchemes?.bearerAuth) {
  throw new Error('OpenAPI document needs version 3.1.0 and a bearerAuth scheme.');
}
for (const [route, item] of Object.entries(document.paths ?? {})) {
  if (!route.startsWith('/')) throw new Error(`Invalid OpenAPI path: ${route}`);
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
    if (!operation.operationId || !operation.responses || Object.keys(operation.responses).length === 0) {
      throw new Error(`OpenAPI operation ${method.toUpperCase()} ${route} needs operationId and responses.`);
    }
  }
}
console.log(`OpenAPI structural check passed (${Object.keys(document.paths).length} paths).`);
