/** Apply bounded transport settings before the process receives public traffic.
 * Kept separate from the executable entrypoint so the values remain testable
 * without opening a port or initializing external dependencies. */
export function configureHttpServer(server, config) {
  if (!server || typeof server !== 'object') throw new TypeError('A Node HTTP server is required.');
  const values = [
    config?.httpKeepAliveTimeoutMs,
    config?.httpHeadersTimeoutMs,
    config?.httpRequestTimeoutMs,
    config?.httpMaxHeadersCount,
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new TypeError('Validated HTTP server limits are required.');
  }
  server.keepAliveTimeout = config.httpKeepAliveTimeoutMs;
  server.headersTimeout = config.httpHeadersTimeoutMs;
  server.requestTimeout = config.httpRequestTimeoutMs;
  server.maxHeadersCount = config.httpMaxHeadersCount;
  return server;
}
