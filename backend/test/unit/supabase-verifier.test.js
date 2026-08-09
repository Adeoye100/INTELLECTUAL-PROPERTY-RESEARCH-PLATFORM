import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { after, before, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { SupabaseVerifier } from '../../src/auth/supabase-verifier.js';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const keyId = 'supabase-unit-test-key';
const { privateKey, publicKey } = await generateKeyPair('ES256');
const { privateKey: attackerPrivateKey } = await generateKeyPair('ES256');
const publicJwk = {
  ...await exportJWK(publicKey),
  alg: 'ES256',
  kid: keyId,
  use: 'sig',
};

let server;
let supabaseUrl;
let issuer;
let verifier;
let jwksRequests = 0;

async function issueToken({
  signingKey = privateKey,
  tokenIssuer = issuer,
  audience = 'authenticated',
  expiration = '5m',
} = {}) {
  return new SignJWT({
    email: 'user@example.test',
    role: 'authenticated',
    session_id: sessionId,
    custom_claim: 'preserved',
  })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(tokenIssuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(signingKey);
}

describe('SupabaseVerifier jwks mode', () => {
  before(async () => {
    server = createServer((request, response) => {
      if (request.url !== '/auth/v1/.well-known/jwks.json') {
        response.writeHead(404).end();
        return;
      }
      jwksRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    supabaseUrl = `http://127.0.0.1:${port}`;
    issuer = `${supabaseUrl}/auth/v1`;
    verifier = new SupabaseVerifier({
      supabaseUrl,
      verificationMode: 'jwks',
      algorithms: ['ES256'],
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('verifies a valid asymmetric token and preserves its claims', async () => {
    const identity = await verifier.verifyAccessToken(await issueToken());

    assert.equal(identity.userId, userId);
    assert.equal(identity.email, 'user@example.test');
    assert.equal(identity.supabaseRole, 'authenticated');
    assert.equal(identity.sessionId, sessionId);
    assert.equal(identity.claims.custom_claim, 'preserved');
    assert.equal(identity.claims.sub, userId);
    assert.equal(jwksRequests, 1);

    await verifier.verifyAccessToken(await issueToken());
    assert.equal(jwksRequests, 1, 'the remote JWKS should be cached');
  });

  it('rejects an expired token with a specific reason', async () => {
    await assert.rejects(
      verifier.verifyAccessToken(await issueToken({ expiration: Math.floor(Date.now() / 1_000) - 1 })),
      (error) => error.code === 'SUPABASE_TOKEN_EXPIRED',
    );
  });

  it('rejects a tampered signature with a specific reason', async () => {
    await assert.rejects(
      verifier.verifyAccessToken(await issueToken({ signingKey: attackerPrivateKey })),
      (error) => error.code === 'SUPABASE_TOKEN_SIGNATURE_INVALID',
    );
  });

  it('rejects a wrong issuer with a specific reason', async () => {
    await assert.rejects(
      verifier.verifyAccessToken(await issueToken({
        tokenIssuer: 'https://another-project.supabase.co/auth/v1',
      })),
      (error) => error.code === 'SUPABASE_TOKEN_ISSUER_INVALID',
    );
  });

  it('rejects a wrong audience with a specific reason', async () => {
    await assert.rejects(
      verifier.verifyAccessToken(await issueToken({ audience: 'anon' })),
      (error) => error.code === 'SUPABASE_TOKEN_AUDIENCE_INVALID',
    );
  });

  it('rejects malformed tokens', async () => {
    await assert.rejects(
      verifier.verifyAccessToken('not-a-jwt'),
      (error) => error.code === 'SUPABASE_TOKEN_MALFORMED',
    );
  });

  it('does not select auth-server verification from an unverified HS256 header', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('untrusted-header-unit-test-secret'));

    await assert.rejects(
      verifier.verifyAccessToken(token),
      (error) => error.code === 'SUPABASE_TOKEN_ALGORITHM_NOT_ALLOWED',
    );
  });
});

const authServerUrl = 'https://project-ref.supabase.co';
const authServerIssuer = `${authServerUrl}/auth/v1`;
const authServerSecret = new TextEncoder().encode('auth-server-mode-unit-test-secret');

async function issueAuthServerToken() {
  return new SignJWT({
    email: 'legacy@example.test',
    role: 'authenticated',
    session_id: sessionId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(authServerIssuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(authServerSecret);
}

function authServerVerifier(fetchImplementation) {
  return new SupabaseVerifier({
    supabaseUrl: authServerUrl,
    publishableKey: 'sb_publishable_unit_test',
    verificationMode: 'auth-server',
    fetchImplementation,
  });
}

describe('SupabaseVerifier auth-server mode', () => {
  it('accepts a token only after a successful /user response', async () => {
    const token = await issueAuthServerToken();
    let requestedUrl;
    let requestedOptions;
    const identity = await authServerVerifier(async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: userId, email: 'legacy@example.test' }),
      };
    }).verifyAccessToken(token);

    assert.equal(requestedUrl, `${authServerIssuer}/user`);
    assert.equal(requestedOptions.headers.apikey, 'sb_publishable_unit_test');
    assert.equal(requestedOptions.headers.authorization, `Bearer ${token}`);
    assert.equal(identity.userId, userId);
    assert.equal(identity.email, 'legacy@example.test');
    assert.equal(identity.supabaseRole, 'authenticated');
    assert.equal(identity.sessionId, sessionId);
    assert.equal(identity.claims.iss, authServerIssuer);
  });

  it('rejects a non-200 /user response without parsing its body', async () => {
    let bodyParsed = false;
    await assert.rejects(
      authServerVerifier(async () => ({
        ok: false,
        status: 401,
        json: async () => {
          bodyParsed = true;
          return { message: 'sensitive upstream detail' };
        },
      })).verifyAccessToken(await issueAuthServerToken()),
      (error) => error.code === 'SUPABASE_AUTH_SERVER_REJECTED',
    );
    assert.equal(bodyParsed, false);
  });

  it('rejects a malformed successful /user response', async () => {
    await assert.rejects(
      authServerVerifier(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ email: 'missing-id@example.test' }),
      })).verifyAccessToken(await issueAuthServerToken()),
      (error) => error.code === 'SUPABASE_AUTH_SERVER_RESPONSE_INVALID',
    );
  });
});

describe('SupabaseVerifier configuration', () => {
  it('rejects unsupported modes and algorithms before handling requests', () => {
    assert.throws(
      () => new SupabaseVerifier({
        supabaseUrl: authServerUrl,
        verificationMode: 'token-header',
      }),
      /must be either jwks or auth-server/,
    );
    assert.throws(
      () => new SupabaseVerifier({
        supabaseUrl: authServerUrl,
        verificationMode: 'jwks',
        algorithms: ['HS256'],
      }),
      /only ES256 and\/or RS256/,
    );
  });
});
