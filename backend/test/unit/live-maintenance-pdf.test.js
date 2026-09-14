import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { startLiveMaintenance } from '../../src/operations/live-maintenance-scheduler.js';

const saved = {
  pdf: process.env.PDF_EXPORT_IN_PROCESS_ENABLED,
  refresh: process.env.USPTO_REFRESH_IN_PROCESS_ENABLED,
  watch: process.env.WATCH_IN_PROCESS_ENABLED,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    PDF_EXPORT_IN_PROCESS_ENABLED: saved.pdf,
    USPTO_REFRESH_IN_PROCESS_ENABLED: saved.refresh,
    WATCH_IN_PROCESS_ENABLED: saved.watch,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('live maintenance PDF worker', () => {
  it('starts and stops the server-side PDF worker when explicitly enabled', async () => {
    process.env.PDF_EXPORT_IN_PROCESS_ENABLED = 'true';
    process.env.USPTO_REFRESH_IN_PROCESS_ENABLED = 'false';
    process.env.WATCH_IN_PROCESS_ENABLED = 'false';
    let starts = 0;
    let stops = 0;
    const maintenance = startLiveMaintenance({
      config: { pdfExportEnabled: true, watchEnabled: false },
      system: {
        pdfExportRuntime: {
          worker: {
            start() { starts += 1; },
            async stop() { stops += 1; },
          },
        },
        watchRuntime: null,
      },
    });

    assert.equal(starts, 1);
    await maintenance.stop();
    assert.equal(stops, 1);
  });

  it('does not start the worker when PDF export is disabled in runtime config', async () => {
    process.env.PDF_EXPORT_IN_PROCESS_ENABLED = 'true';
    process.env.USPTO_REFRESH_IN_PROCESS_ENABLED = 'false';
    process.env.WATCH_IN_PROCESS_ENABLED = 'false';
    let starts = 0;
    const maintenance = startLiveMaintenance({
      config: { pdfExportEnabled: false, watchEnabled: false },
      system: {
        pdfExportRuntime: { worker: { start() { starts += 1; }, async stop() {} } },
        watchRuntime: null,
      },
    });
    assert.equal(starts, 0);
    await maintenance.stop();
  });
});
