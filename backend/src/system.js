import { createClient } from 'redis';
import {
  createAuthenticate,
  createResolveRoleAndFirm,
  createSupabaseAuthenticate,
} from './auth/middleware.js';
import { passwordHasher } from './auth/password.js';
import { AuthService } from './auth/auth-service.js';
import { RedisSessionStore } from './auth/session-store.js';
import { RedisRoleFirmResolver } from './auth/role-firm-resolver.js';
import { SupabaseAdminUserService } from './auth/supabase-admin-user-service.js';
import { SupabaseVerifier } from './auth/supabase-verifier.js';
import { TokenService } from './auth/token-service.js';
import { UserRepository } from './auth/user-repository.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

export async function createSystem(config) {
  const protectedAuthMode = config.protectedAuthMode ?? 'supabase';
  if (!['supabase', 'legacy'].includes(protectedAuthMode)) {
    throw new TypeError('protectedAuthMode must be either supabase or legacy.');
  }

  let supabaseVerifier;
  let supabaseAdminUserService;
  if (protectedAuthMode === 'supabase') {
    supabaseVerifier = new SupabaseVerifier({
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
      verificationMode: config.supabaseJwtVerificationMode,
      algorithms: config.supabaseJwtAlgorithms,
    });
    supabaseAdminUserService = new SupabaseAdminUserService({
      supabaseUrl: config.supabaseUrl,
      secretKey: config.supabaseSecretKey,
    });
  }

  const pool = createPool(config.databaseUrl, config.databaseSsl);
  const redisClient = createClient({ url: config.redisUrl });
  redisClient.on('error', (error) => {
    console.error('Redis client error', { name: error.name, code: error.code ?? 'UNKNOWN' });
  });
  await redisClient.connect();

  const tokenService = new TokenService({
    secret: config.jwtAccessSecret,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
  });
  const sessionStore = new RedisSessionStore(redisClient, config.refreshTokenTtlSeconds);
  const userRepository = new UserRepository(pool);
  const authService = new AuthService({
    userRepository,
    passwordHasher,
    tokenService,
    sessionStore,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
    inviteTokenTtlSeconds: config.inviteTokenTtlSeconds,
  });

  let roleFirmResolver;
  let authenticate;
  if (protectedAuthMode === 'legacy') {
    authenticate = createAuthenticate(tokenService);
  } else {
    roleFirmResolver = new RedisRoleFirmResolver({
      redisClient,
      userRepository,
      supabaseAdminUserService,
    });
    authenticate = [
      createSupabaseAuthenticate(supabaseVerifier),
      createResolveRoleAndFirm(roleFirmResolver),
    ];
  }

  return {
    app: createApp({ authService, authenticate }),
    pool,
    redisClient,
    authService,
    sessionStore,
    roleFirmResolver,
    supabaseAdminUserService,
    supabaseVerifier,
    async close() {
      await Promise.allSettled([redisClient.quit(), pool.end()]);
    },
  };
}
