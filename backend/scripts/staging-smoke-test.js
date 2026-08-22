import { parseStagingSmokeConfig, runStagingSmoke } from '../src/phase2/staging-smoke.js';

let config;
try {
  config = parseStagingSmokeConfig();
} catch (error) {
  console.error(`STAGING_SMOKE_CONFIG_INVALID: ${error instanceof Error ? error.message : 'Invalid configuration.'}`);
  process.exitCode = 2;
}

if (config) {
  const report = await runStagingSmoke({ config });
  for (const result of report.results) {
    console.log(`${result.outcome} ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
  }
  console.log(`Staging smoke summary: ${report.totals.pass} passed, ${report.totals.fail} failed, ${report.totals.skip} skipped.`);
  if (!report.ok) process.exitCode = 1;
}
