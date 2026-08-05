import { createHash, randomBytes } from 'node:crypto';

const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');

export class RedisSessionStore {
  constructor(redisClient, ttlSeconds) {
    this.redisClient = redisClient;
    this.ttlSeconds = ttlSeconds;
  }

  keyFor(token) {
    return `session:${tokenDigest(token)}`;
  }

  async create(user) {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.redisClient.set(
      this.keyFor(refreshToken),
      JSON.stringify({ userId: user.id, createdAt: new Date().toISOString() }),
      { EX: this.ttlSeconds },
    );
    return refreshToken;
  }

  async rotate(refreshToken) {
    const serialized = await this.redisClient.getDel(this.keyFor(refreshToken));
    if (!serialized) return null;

    let session;
    try {
      session = JSON.parse(serialized);
    } catch {
      return null;
    }
    if (!session || typeof session.userId !== 'string') return null;

    return {
      userId: session.userId,
      refreshToken: await this.create({ id: session.userId }),
    };
  }

  async invalidate(refreshToken) {
    await this.redisClient.del(this.keyFor(refreshToken));
  }
}
