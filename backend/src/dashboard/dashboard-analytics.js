import { badRequest } from '../errors.js';

const RANGES = new Map([['7d', 7], ['30d', 30], ['90d', 90]]);
const TTL_SECONDS = 60;

export function normalizeDashboardRange(value) {
  const range = value === undefined ? '30d' : String(value);
  if (!RANGES.has(range)) throw badRequest('INVALID_DASHBOARD_RANGE', 'Dashboard range must be one of 7d, 30d or 90d.');
  return { key: range, days: RANGES.get(range) };
}

export class DashboardAnalyticsRepository {
  constructor(database, { clock = () => new Date() } = {}) { if (!database?.query) throw new TypeError('DashboardAnalyticsRepository needs a database.'); this.database = database; this.clock = clock; }
  async aggregate({ firmId, days }) {
    const since = new Date(this.clock().getTime() - (days - 1) * 86400000).toISOString();
    const [total, status, risk, renewals, watches, activity, alerts] = await Promise.all([
      this.database.query('SELECT COUNT(*)::int AS total FROM portfolio_marks WHERE firm_id = $1', [firmId]),
      this.database.query('SELECT status, COUNT(*)::int AS count FROM portfolio_marks WHERE firm_id = $1 GROUP BY status', [firmId]),
      this.database.query(`SELECT COALESCE(rs.composite_rating, 'unknown') AS rating, COUNT(*)::int AS count FROM portfolio_marks pm LEFT JOIN LATERAL (SELECT composite_rating FROM risk_scores WHERE firm_id = pm.firm_id AND portfolio_mark_id = pm.id ORDER BY created_at DESC LIMIT 1) rs ON true WHERE pm.firm_id = $1 GROUP BY rs.composite_rating`, [firmId]),
      this.database.query("SELECT COUNT(*)::int AS count FROM portfolio_marks WHERE firm_id = $1 AND renewal_date IS NOT NULL AND renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'", [firmId]),
      this.database.query("SELECT state, COUNT(*)::int AS count FROM watches WHERE firm_id = $1 GROUP BY state", [firmId]),
      this.database.query('SELECT DATE(last_polled_at) AS day, COUNT(*)::int AS polls, COUNT(*) FILTER (WHERE last_poll_status = \'partial\')::int AS partial, COUNT(*) FILTER (WHERE last_poll_status = \'failed\')::int AS unavailable FROM watches WHERE firm_id = $1 AND last_polled_at >= $2 GROUP BY DATE(last_polled_at)', [firmId, since]),
      this.database.query('SELECT DATE(created_at) AS day, COUNT(*)::int AS alerts FROM alerts WHERE firm_id = $1 AND created_at >= $2 GROUP BY DATE(created_at)', [firmId, since]),
    ]);
    const daysByDate = new Map();
    for (let i = 0; i < days; i += 1) { const date = new Date(Date.parse(since) + i * 86400000).toISOString().slice(0, 10); daysByDate.set(date, { date, polls: 0, alerts: 0, partial: 0, unavailable: 0 }); }
    for (const row of activity.rows) { const date = String(row.day).slice(0, 10); if (daysByDate.has(date)) Object.assign(daysByDate.get(date), { polls: Number(row.polls) || 0, partial: Number(row.partial) || 0, unavailable: Number(row.unavailable) || 0 }); }
    for (const row of alerts.rows) { const date = String(row.day).slice(0, 10); if (daysByDate.has(date)) daysByDate.get(date).alerts = Number(row.alerts) || 0; }
    return { generatedAt: this.clock().toISOString(), range: `${days}d`, portfolio: { total: Number(total.rows[0]?.total) || 0, byRisk: risk.rows.map((row) => ({ risk: row.rating, count: Number(row.count) || 0 })), byStatus: status.rows.map((row) => ({ status: row.status, count: Number(row.count) || 0 })), renewalsDueSoon: Number(renewals.rows[0]?.count) || 0 }, watchActivity: { points: [...daysByDate.values()], enabled: Number(watches.rows.find((row) => row.state === 'enabled')?.count) || 0, disabled: Number(watches.rows.find((row) => row.state === 'paused')?.count) || 0 } };
  }
}

export class DashboardAnalyticsService {
  constructor({ repository, redisClient = null, clock = () => new Date() } = {}) { if (!repository) throw new TypeError('DashboardAnalyticsService needs a repository.'); this.repository = repository; this.redisClient = redisClient; this.clock = clock; }
  key(firmId, range) { return `dashboard:analytics:v1:${firmId}:${range}`; }
  async get({ firmId, range }) {
    const normalized = normalizeDashboardRange(range); const key = this.key(firmId, normalized.key);
    if (this.redisClient?.get) { try { const value = await this.redisClient.get(key); if (value) return { ...JSON.parse(value), cacheStatus: 'hit' }; } catch { /* cache is an optimization; DB remains authoritative */ } }
    const payload = await this.repository.aggregate({ firmId, days: normalized.days });
    if (this.redisClient?.set) { try { await this.redisClient.set(key, JSON.stringify(payload), { EX: TTL_SECONDS }); } catch { /* safe degradation */ } }
    return { ...payload, cacheStatus: 'miss' };
  }
}
