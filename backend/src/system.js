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
import { RedisAuthRateLimiter } from './auth/auth-rate-limiter.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';
import { PortfolioMarkRepository } from './portfolio/portfolio-mark-repository.js';
import { PortfolioMarkService } from './portfolio/portfolio-mark-service.js';
import { createSearchRuntime } from './search/search-runtime.js';
import { WatchRepository } from './watch/watch-repository.js';
import { WatchService } from './watch/watch-service.js';
import { createWatchRuntime } from './watch/watch-runtime.js';
import { AlertRepository } from './alerts/alert-repository.js';
import { AlertGenerationService } from './alerts/alert-generation-service.js';
import { AlertService } from './alerts/alert-service.js';

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

  const authRateLimiter = config.authRateLimitEnabled
    ? new RedisAuthRateLimiter({
      redisClient,
      secret: config.authRateLimitKeySecret,
      policies: config.authRateLimitPolicies,
    })
    : null;

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
  const portfolioMarkRepository = new PortfolioMarkRepository(pool);
  const portfolioMarkService = new PortfolioMarkService({ repository: portfolioMarkRepository });
  const watchRepository = new WatchRepository(pool);
  const watchService = new WatchService({
    repository: watchRepository, defaultPollIntervalMinutes: config.watchPollIntervalMinutes,
  });
  const alertRepository = new AlertRepository(pool);
  const alertService = new AlertService({ repository: alertRepository });
  const alertGenerationService = config.watchEnabled
    ? new AlertGenerationService({ repository: alertRepository }) : null;
  const watchRuntime = createWatchRuntime({
    config, redisClient, watchRepository, searchService, alertGenerationService,
  });

  return {
    app: createApp({
      authService,
      authenticate,
      authenticateIdentity,
      provisioningService,
      searchService,
      portfolioMarkService,
      watchService,
      alertService,
      authRateLimiter,
      trustProxyHops: config.trustProxyHops,
    }),
    pool,
    redisClient,
    authRateLimiter,
    authService,
    provisioningService,
    portfolioMarkRepository,
    portfolioMarkService,
    watchRepository,
    watchService,
    watchRuntime,
    alertRepository,
    alertService,
    alertGenerationService,
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
