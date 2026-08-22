const port = Number(process.env.PORT ?? 3000);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3_000);
try {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
  process.exitCode = response.ok ? 0 : 1;
} catch { process.exitCode = 1; } finally { clearTimeout(timeout); }
