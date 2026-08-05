import { loadConfig } from './config.js';
import { createSystem } from './system.js';

const config = loadConfig();
const system = await createSystem(config);
const server = system.app.listen(config.port, () => {
  console.log(`IPRP API listening on port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await system.close();
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
