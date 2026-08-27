import { createClient } from 'redis';
import { loadConfig, loadWorkerFeatureGate } from '../config.js';
import { createPool } from '../db/pool.js';
import { AuditLogRepository } from '../audit/audit-log-repository.js';
import { AuditService } from '../audit/audit-service.js';
import { ExportAuditService } from '../audit/export-audit-service.js';
import { SearchResultRepository } from '../search/search-result-repository.js';
import { SearchResultService } from '../search/search-result-service.js';
import { PortfolioMarkRepository } from '../portfolio/portfolio-mark-repository.js';
import { PortfolioMarkService } from '../portfolio/portfolio-mark-service.js';
import { OfficeActionRefRepository } from '../office-actions/office-action-ref-repository.js';
import { OfficeActionRefService } from '../office-actions/office-action-ref-service.js';
import { WatchRepository } from '../watch/watch-repository.js';
import { WatchService } from '../watch/watch-service.js';
import { AlertRepository } from '../alerts/alert-repository.js';
import { AlertService } from '../alerts/alert-service.js';
import { createPdfExportRuntime } from './pdf-export-runtime.js';
import { WorkerHeartbeat } from '../operations/worker-heartbeat.js';

const enabled = loadWorkerFeatureGate(process.env, 'PDF_EXPORT_ENABLED');
if (!enabled) {
  console.log('PDF export worker is disabled.');
} else {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl, config);
  const redisClient = createClient({ url: config.redisUrl });
  redisClient.on('error', (error) => console.error('PDF export worker Redis error', { name: error.name, code: error.code ?? 'UNKNOWN' }));
  await redisClient.connect();
  const auditService = new AuditService({ repository: new AuditLogRepository(pool) });
  const searchResultService = new SearchResultService({ repository: new SearchResultRepository(pool), auditService });
  const portfolioMarkService = new PortfolioMarkService({ repository: new PortfolioMarkRepository(pool) });
  const officeActionRefService = new OfficeActionRefService({ repository: new OfficeActionRefRepository(pool) });
  const watchService = new WatchService({ repository: new WatchRepository(pool), defaultPollIntervalMinutes: config.watchPollIntervalMinutes });
  const alertService = new AlertService({ repository: new AlertRepository(pool) });
  const runtime = createPdfExportRuntime({
    config, redisClient, database: pool, exportAuditService: new ExportAuditService({ auditService }),
    searchResultService, portfolioMarkService, officeActionRefService, watchService, alertService,
  });
  runtime.worker.start();
  console.log('PDF export worker started.');
  const heartbeat = new WorkerHeartbeat({
    redisClient, serviceName: 'pdf-export', ttlSeconds: config.workerHeartbeatTtlSeconds,
  });
  await heartbeat.beat();
  const heartbeatTimer = setInterval(() => {
    heartbeat.beat().catch((error) => console.error('PDF export heartbeat error', { name: error.name, code: error.code ?? 'UNKNOWN' }));
  }, Math.floor(config.workerHeartbeatTtlSeconds * 500));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    await runtime.worker.stop();
    await Promise.allSettled([redisClient.quit(), pool.end()]);
  };
  process.once('SIGINT', () => { shutdown().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { shutdown().finally(() => process.exit(0)); });
}
