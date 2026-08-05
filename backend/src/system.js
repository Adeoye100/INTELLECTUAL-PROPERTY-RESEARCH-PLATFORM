import { createClient } from 'redis';
import { createAuthenticate } from './auth/middleware.js';
import { passwordHasher } from './auth/password.js';
import { AuthService } from './auth/auth-service.js';
import { RedisSessionStore } from './auth/session-store.js';
import { TokenService } from './auth/token-service.js';
import { UserRepository } from './auth/user-repository.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

export async function createSystem(config) {
  const pool = createPool(config.databaseUrl);
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
  const authService = new AuthService({
    userRepository: new UserRepository(pool),
    passwordHasher,
    tokenService,
    sessionStore,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  });

  return {
    app: createApp({ authService, authenticate: createAuthenticate(tokenService) }),
    pool,
    redisClient,
    authService,
    sessionStore,
    async close() {
      await Promise.allSettled([redisClient.quit(), pool.end()]);
    },
  };
}
