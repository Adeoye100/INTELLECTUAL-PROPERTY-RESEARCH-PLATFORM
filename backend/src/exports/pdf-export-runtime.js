import { ExportRepository } from './export-repository.js';
import { ExportService } from './export-service.js';
import { ExportSourceLoader } from './export-source-loader.js';
import { FilePdfStorage } from './export-storage.js';
import { PdfRenderer } from './pdf-renderer.js';
import { RedisPdfExportQueue } from './pdf-export-queue.js';
import { PdfExportProcessor } from './pdf-export-processor.js';
import { PdfExportWorker } from './pdf-export-worker.js';

export function createPdfExportRuntime({
  config, redisClient, database, exportAuditService, searchResultService, portfolioMarkService,
  officeActionRefService, watchService, alertService, storage = null, clock,
} = {}) {
  if (!config?.pdfExportEnabled) return null;
  const repository = new ExportRepository(database);
  const queue = new RedisPdfExportQueue({
    redisClient, queueKey: config.pdfExportQueueKey, maxAttempts: config.pdfExportMaxAttempts,
  });
  const privateStorage = storage ?? new FilePdfStorage({ root: config.pdfExportStorageRoot, maxBytes: config.pdfExportMaxBytes });
  const sourceLoader = new ExportSourceLoader({ searchResultService, portfolioMarkService, officeActionRefService, watchService, alertService });
  const renderer = new PdfRenderer({ maxPages: config.pdfExportMaxPages, maxResults: config.pdfExportMaxResults });
  const exportService = new ExportService({
    repository, queue, exportAuditService, storage: privateStorage, clock, maxAttempts: config.pdfExportMaxAttempts,
  });
  const processor = new PdfExportProcessor({
    repository, queue, sourceLoader, renderer, storage: privateStorage, exportAuditService, exportService,
    clock, maxAttempts: config.pdfExportMaxAttempts,
  });
  const worker = new PdfExportWorker({
    queue, processor, intervalMs: config.pdfExportWorkerIntervalMs, maxJobsPerTick: config.pdfExportWorkerMaxJobs,
  });
  return { repository, queue, storage: privateStorage, sourceLoader, renderer, exportService, processor, worker };
}
