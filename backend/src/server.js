import { loadConfig } from './config.js';
import { createSystem } from './system.js';

const config = loadConfig();
const system = await createSystem(config);
const server = system.app.listen(config.port, '0.0.0.0', () => {
  console.log(`IPRP API listening on port ${config.port}.`);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}; shutting down.`);
  const deadline = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 25_000);
  deadline.unref();
  server.close(async () => {
    try {
      await system.close();
      process.exitCode = 0;
    } finally { clearTimeout(deadline); }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
