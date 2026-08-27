import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { configureHttpServer } from '../../src/http-server.js';

describe('HTTP server transport bounds', () => {
  it('applies validated keep-alive, header, request, and header-count bounds', () => {
    const server = createServer();
    try {
      configureHttpServer(server, {
        httpKeepAliveTimeoutMs: 5_000,
        httpHeadersTimeoutMs: 10_000,
        httpRequestTimeoutMs: 30_000,
        httpMaxHeadersCount: 100,
      });
      assert.equal(server.keepAliveTimeout, 5_000);
      assert.equal(server.headersTimeout, 10_000);
      assert.equal(server.requestTimeout, 30_000);
      assert.equal(server.maxHeadersCount, 100);
    } finally {
      server.close();
    }
  });

  it('refuses missing or unsafe transport configuration', () => {
    assert.throws(() => configureHttpServer(createServer(), {}));
  });
});
