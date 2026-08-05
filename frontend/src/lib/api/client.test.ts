import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

const config = { baseUrl: 'https://api.example.test/api/v1', mode: 'live' as const };

describe('ApiClient', () => {
  it('adds authentication and JSON headers and parses JSON responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'result-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = new ApiClient({ config, fetchImpl, getAccessToken: () => 'access-token' });

    await expect(client.requestJson<{ id: string }>('/search', {
      method: 'POST',
      body: { mark: 'FORGE' },
    })).resolves.toEqual({ id: 'result-1' });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/api/v1/search', expect.any(Object));
    expect(headers.get('authorization')).toBe('Bearer access-token');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ mark: 'FORGE' }));
  });

  it('normalizes structured HTTP failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'INVALID_FILTERS',
      message: 'One or more filters are invalid.',
      details: { field: 'jurisdiction' },
      requestId: 'request-123',
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/problem+json' },
    }));
    const client = new ApiClient({ config, fetchImpl });

    const error = await client.requestJson('/search').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      message: 'One or more filters are invalid.',
      details: { field: 'jurisdiction' },
      requestId: 'request-123',
      serverCode: 'INVALID_FILTERS',
    });
  });

  it('normalizes network failures without leaking fetch implementation errors', async () => {
    const client = new ApiClient({
      config,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('internal DNS detail')),
    });

    await expect(client.requestJson('/portfolio')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'We could not reach the service. Check your connection and try again.',
    });
  });

  it('invokes session-expiry behavior for authenticated 401 responses', async () => {
    const onUnauthorized = vi.fn();
    const client = new ApiClient({
      config,
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
      getAccessToken: () => 'expired-token',
      onUnauthorized,
    });

    await expect(client.requestJson('/dashboard/summary')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('normalizes timeouts', async () => {
    vi.useFakeTimers();
    const client = new ApiClient({
      config,
      timeoutMs: 50,
      fetchImpl: vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })),
    });

    const request = client.requestJson('/slow');
    await vi.advanceTimersByTimeAsync(50);
    await expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
    vi.useRealTimers();
  });
});
