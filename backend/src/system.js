import { createClient } from 'redis';
import {
  createResolveRoleAndFirm,
  createSupabaseAuthenticate,
} from './auth/middleware.js';
import { AuthService } from './auth/auth-service.js';
import { ProvisioningService } from './auth/provisioning-service.js';
import { RedisRoleFirmResolver } from './auth/role-firm-resolver.js';
import { SupabaseAdminUserService } from './auth/supabase-admin-user-service.js';
import { SupabaseVerifier } from './auth/supabase-verifier.js';
import { TokenService } from './auth/token-service.js';
import { UserRepository } from './auth/user-repository.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';
import { createSearchRuntime } from './search/search-runtime.js';

export async function createSystem(config) {
  const { searchSources, federatedSearchService, searchService } = createSearchRuntime(config);
  const supabaseVerifier = new SupabaseVerifier({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.supabasePublishableKey,
    verificationMode: config.supabaseJwtVerificationMode,
    algorithms: config.supabaseJwtAlgorithms,
  });
  const supabaseAdminUserService = new SupabaseAdminUserService({
    supabaseUrl: config.supabaseUrl,
    secretKey: config.supabaseSecretKey,
  });

  const pool = createPool(config.databaseUrl, config.databaseSsl);
  const redisClient = createClient({ url: config.redisUrl });
  redisClient.on('error', (error) => {
    console.error('Redis client error', { name: error.name, code: error.code ?? 'UNKNOWN' });
  });
  await redisClient.connect();

  const tokenService = new TokenService({
    secret: config.jwtAccessSecret,
    inviteTokenTtlSeconds: config.inviteTokenTtlSeconds,
  });
  const userRepository = new UserRepository(pool);
  const authService = new AuthService({
    userRepository,
    tokenService,
    inviteTokenTtlSeconds: config.inviteTokenTtlSeconds,
  });

  const roleFirmResolver = new RedisRoleFirmResolver({
    redisClient,
    userRepository,
    supabaseAdminUserService,
  });
  const authenticate = [
    createSupabaseAuthenticate(supabaseVerifier),
    createResolveRoleAndFirm(roleFirmResolver),
  ];
  const authenticateIdentity = createSupabaseAuthenticate(supabaseVerifier);
  const provisioningService = new ProvisioningService({ userRepository, roleFirmResolver });

  return {
    app: createApp({
      authService, authenticate, authenticateIdentity, provisioningService, searchService,
    }),
    pool,
    redisClient,
    authService,
    provisioningService,
    roleFirmResolver,
    supabaseAdminUserService,
    supabaseVerifier,
    searchSources,
    federatedSearchService,
    searchService,
    async close() {
      await Promise.allSettled([redisClient.quit(), pool.end()]);
    },
  };
}
