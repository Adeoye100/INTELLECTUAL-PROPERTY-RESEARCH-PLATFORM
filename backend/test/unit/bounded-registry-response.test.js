import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import {
  limitResponseBody,
  readBoundedJson,
  readBoundedText,
  requestBoundedResponse,
} from '../../src/registries/bounded-response.js';

function fakeResponse(body, { contentLength = null } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-length' ? contentLength : null; } },
    body: Readable.from([Buffer.from(body)]),
  };
}

describe('bounded outbound registry responses', () => {
  it('rejects declared compressed oversize before body consumption and aborts the request', () => {
    const controller = new AbortController();
    assert.throws(() => limitResponseBody(fakeResponse('small', { contentLength: '101' }), {
      sourceName: 'USPTO', operation: 'listing', maxCompressedBytes: 100, maxDecompressedBytes: 100, abortController: controller,
    }), { code: 'REGISTRY_RESPONSE_TOO_LARGE' });
    assert.equal(controller.signal.aborted, true);
  });

  it('rejects streamed oversize and decompression expansion when content length is absent or dishonest', async () => {
    const absentController = new AbortController();
    const absent = { body: limitResponseBody(fakeResponse('x'.repeat(101)), {
      sourceName: 'USPTO', operation: 'listing', maxCompressedBytes: 100, maxDecompressedBytes: 100, abortController: absentController,
    }) };
    await assert.rejects(readBoundedText(absent, { maxBytes: 100, sourceName: 'USPTO', operation: 'listing' }), { code: 'REGISTRY_RESPONSE_TOO_LARGE' });
    assert.equal(absentController.signal.aborted, true);

    // Fetch implementations commonly expose decoded response bytes. The small
    // declared transfer length below models a compressed payload that inflates.
    const expanded = { body: limitResponseBody(fakeResponse('x'.repeat(101), { contentLength: '10' }), {
      sourceName: 'USPTO', operation: 'listing', maxCompressedBytes: 100, maxDecompressedBytes: 100,
    }) };
    await assert.rejects(readBoundedText(expanded, { maxBytes: 100, sourceName: 'USPTO', operation: 'listing' }), { code: 'REGISTRY_RESPONSE_TOO_LARGE' });
  });

  it('accepts a valid response without Content-Length and bounds JSON parsing input', async () => {
    const request = await requestBoundedResponse({
      fetchImpl: async () => fakeResponse('{"status":"ok"}'), url: 'https://registry.example.test/status',
      sourceName: 'USPTO', operation: 'getStatus', accept: 'application/json', maxCompressedBytes: 64, maxDecompressedBytes: 64,
    });
    assert.deepEqual(await readBoundedJson(request, { sourceName: 'USPTO', operation: 'getStatus', maxBytes: 64 }), { status: 'ok' });
  });
});
