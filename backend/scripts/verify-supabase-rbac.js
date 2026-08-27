import express from 'express';
import { createClient } from 'redis';
import request from 'supertest';
import { createResolveRoleAndFirm, createSupabaseAuthenticate, requireRole } from '../src/auth/middleware.js';
import { RedisRoleFirmResolver } from '../src/auth/role-firm-resolver.js';
import { SupabaseAdminUserService } from '../src/auth/supabase-admin-user-service.js';
import { SupabaseVerifier } from '../src/auth/supabase-verifier.js';
import { UserRepository } from '../src/auth/user-repository.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { errorHandler } from '../src/errors.js';

const token = process.env.SUPABASE_TEST_ACCESS_TOKEN?.trim();
if (!token) throw new Error('Missing required environment variable: SUPABASE_TEST_ACCESS_TOKEN');

const config = loadConfig(process.env);

const pool = createPool(config.databaseUrl, config);
const redisClient = createClient({ url: config.redisUrl });
redisClient.on('error', () => {});

try {
  await redisClient.connect();
  const verifier = new SupabaseVerifier({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.supabasePublishableKey,
    verificationMode: config.supabaseJwtVerificationMode,
    algorithms: config.supabaseJwtAlgorithms,
  });
  const identity = await verifier.verifyAccessToken(token);

  const repository = new UserRepository(pool);
  const supabaseAdminUserService = new SupabaseAdminUserService({
    supabaseUrl: config.supabaseUrl,
    secretKey: config.supabaseSecretKey,
  });
  let adminLookups = 0;
  const countingAdminUserService = {
    async getAuthoritativeUser(...args) {
      adminLookups += 1;
      return supabaseAdminUserService.getAuthoritativeUser(...args);
    },
  };
  let databaseLookups = 0;
  const countingRepository = {
    async findBySupabaseUserId(...args) {
      databaseLookups += 1;
      return repository.findBySupabaseUserId(...args);
    },
    async findOrLinkBySupabaseIdentity(...args) {
      databaseLookups += 1;
      return repository.findOrLinkBySupabaseIdentity(...args);
    },
  };
  const resolver = new RedisRoleFirmResolver({
    redisClient,
    userRepository: countingRepository,
    supabaseAdminUserService: countingAdminUserService,
  });
  await resolver.invalidate(identity.userId);
  const membership = await resolver.resolveRoleAndFirm(identity.userId, identity.email);
  if (!membership) throw new Error('No local application user matches the verified Supabase identity.');

  await resolver.invalidate(identity.userId);
  databaseLookups = 0;
  const deniedRole = ['admin', 'attorney', 'viewer'].find((role) => role !== membership.role);
  const app = express();
  const authenticate = createSupabaseAuthenticate(verifier, { warn() {} });
  const authorize = createResolveRoleAndFirm(resolver);
  app.get('/allowed', authenticate, authorize, requireRole([membership.role]), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/denied', authenticate, authorize, requireRole([deniedRole]), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const allowed = await request(app).get('/allowed').set('Authorization', `Bearer ${token}`);
  const lookupsAfterMiss = databaseLookups;
  const denied = await request(app).get('/denied').set('Authorization', `Bearer ${token}`);
  if (allowed.status !== 200 || denied.status !== 403) {
    throw new Error('Live Supabase RBAC route checks did not return the expected 200/403 statuses.');
  }
  if (lookupsAfterMiss !== 1 || databaseLookups !== 1) {
    throw new Error('Live role-cache miss/hit behavior was not observed as expected.');
  }

  console.log('Live Supabase RBAC verification succeeded.', {
    verificationMode: config.supabaseJwtVerificationMode,
    applicationRole: membership.role,
    firmLinked: true,
    firstUseEmailConfirmationChecked: adminLookups > 0,
    firstRequestUsedDatabase: true,
    secondRequestUsedRoleCache: true,
    allowedStatus: allowed.status,
    deniedStatus: denied.status,
  });
} finally {
  await Promise.allSettled([
    redisClient.isOpen ? redisClient.quit() : undefined,
    pool.end(),
  ]);
}
