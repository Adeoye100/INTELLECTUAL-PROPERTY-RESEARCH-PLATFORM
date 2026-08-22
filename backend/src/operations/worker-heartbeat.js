const SERVICE_NAME = /^[a-z][a-z0-9_-]{1,63}$/;

export class WorkerHeartbeat {
  constructor({ redisClient, serviceName, ttlSeconds = 120, clock = () => new Date() } = {}) {
    if (!redisClient || typeof redisClient.set !== 'function') throw new TypeError('WorkerHeartbeat needs a Redis client.');
    if (typeof serviceName !== 'string' || !SERVICE_NAME.test(serviceName)) throw new TypeError('WorkerHeartbeat needs a safe service name.');
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 3_600) throw new TypeError('WorkerHeartbeat TTL must be between 30 and 3600 seconds.');
    if (typeof clock !== 'function') throw new TypeError('WorkerHeartbeat needs a clock.');
    this.redisClient = redisClient;
    this.serviceName = serviceName;
    this.ttlSeconds = ttlSeconds;
    this.clock = clock;
  }

  get key() { return `worker:heartbeat:${this.serviceName}`; }

  async beat() {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('WorkerHeartbeat clock must return a valid Date.');
    await this.redisClient.set(this.key, now.toISOString(), { EX: this.ttlSeconds });
  }
}
