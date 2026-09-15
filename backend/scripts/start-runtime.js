import { spawn } from 'node:child_process';

function strictBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = raw.trim();
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false.`);
  }
  return value === 'true';
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

const demoReadOnlyMode = strictBoolean('DEMO_READ_ONLY_MODE', false);

if (demoReadOnlyMode) {
  console.warn('DEMO_READ_ONLY_MODE=true: skipping database migrations and starting the API against the existing read-only corpus.');
} else {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  await run(pnpm, ['migrate']);
}

await import('../src/server.js');
