import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { configureHttpServer } from './http-server.js';
import { createSystem } from './system.js';

const config = loadConfig();
const system = await createSystem(config);
const server = createServer(system.app);
// Keep slow or header-heavy connections from occupying the Render web process
// indefinitely. The values are parsed and bounded by the runtime config.
configureHttpServer(server, config);
server.listen(config.port, '0.0.0.0', () => {
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
