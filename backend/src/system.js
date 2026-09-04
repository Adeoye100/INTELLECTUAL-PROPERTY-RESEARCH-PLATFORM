import { createClient } from 'redis';
import {
  createResolveRoleAndFirm,
  createSupabaseAuthenticate,
} from './auth/middleware.js';
import { AuthService } from './auth/auth-service.js';
import { ProvisioningService } from './auth/provisioning-service.js';
import { OrganizationProvisioningRepository } from './auth/organization-provisioning-repository.js';
import { InvitationRepository } from './auth/invitation-repository.js';
import { InvitationService } from './auth/invitation-service.js';
import { createInvitationMailer } from './auth/invitation-mailer.js';
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
import { SearchResultRepository } from './search/search-result-repository.js';
import { SearchResultService } from './search/search-result-service.js';
import { WatchRepository } from './watch/watch-repository.js';
import { WatchService } from './watch/watch-service.js';
import { createWatchRuntime } from './watch/watch-runtime.js';
import { AlertRepository } from './alerts/alert-repository.js';
import { AlertGenerationService } from './alerts/alert-generation-service.js';
import { AlertService } from './alerts/alert-service.js';
import { AuditLogRepository } from './audit/audit-log-repository.js';
import { AuditService } from './audit/audit-service.js';
import { ExportAuditService } from './audit/export-audit-service.js';
import { UserRoleService } from './users/user-role-service.js';
import { createOfficeActionSearchRuntime } from './office-actions/office-action-search-runtime.js';
import { OfficeActionRefRepository } from './office-actions/office-action-ref-repository.js';
import { OfficeActionRefService } from './office-actions/office-action-ref-service.js';
import { createPdfExportRuntime } from './exports/pdf-export-runtime.js';
import { DashboardAnalyticsRepository, DashboardAnalyticsService } from './dashboard/dashboard-analytics.js';
import { PaystackClient } from './billing/paystack-client.js';
import { BillingRepository } from './billing/billing-repository.js';
import { BillingService } from './billing/billing-service.js';

export async function createSystem(config, { officeActionSources = [], exportStorage = null } = {}) {
  const { searchSources, federatedSearchService, searchService } = createSearchRuntime(config);
  const {
    officeActionSources: configuredOfficeActionSources,
    federatedOfficeActionSearchService,
    officeActionSearchService,
  } = createOfficeActionSearchRuntime(config, { sources: officeActionSources });
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

  const pool = createPool(config.databaseUrl, config);
  const organizationProvisioningRepository = new OrganizationProvisioningRepository(pool);
  const invitationRepository = new InvitationRepository(pool);
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
  const auditLogRepository = new AuditLogRepository(pool);
  const auditService = new AuditService({ repository: auditLogRepository });
  const invitationService = new InvitationService({
    invitationRepository, tokenService, invitationMailer: createInvitationMailer(config), auditService,
    roleFirmResolver, supabaseAdminUserService, inviteTokenTtlSeconds: config.inviteTokenTtlSeconds,
  });
  const exportAuditService = new ExportAuditService({ auditService });
  const searchResultRepository = new SearchResultRepository(pool);
  const searchResultService = new SearchResultService({ repository: searchResultRepository, auditService });
  const authenticate = [
    createSupabaseAuthenticate(supabaseVerifier),
    createResolveRoleAndFirm(roleFirmResolver),
  ];
  const authenticateIdentity = createSupabaseAuthenticate(supabaseVerifier);
  const provisioningService = new ProvisioningService({ organizationProvisioningRepository, roleFirmResolver, supabaseAdminUserService, firmSignupEnabled: config.publicFirmSignupEnabled, organizationIntentTtlSeconds: config.organizationIntentTtlSeconds });
  const portfolioMarkRepository = new PortfolioMarkRepository(pool);
  const portfolioMarkService = new PortfolioMarkService({
    repository: portfolioMarkRepository, auditService,
  });
  const watchRepository = new WatchRepository(pool);
  const watchService = new WatchService({
    repository: watchRepository, defaultPollIntervalMinutes: config.watchPollIntervalMinutes, auditService,
  });
  const alertRepository = new AlertRepository(pool);
  const alertService = new AlertService({ repository: alertRepository, auditService });
  const dashboardAnalyticsService = new DashboardAnalyticsService({ repository: new DashboardAnalyticsRepository(pool), redisClient });
  const billingRepository = config.paystackEnabled ? new BillingRepository(pool) : null;
  const billingService = config.paystackEnabled ? new BillingService({
    repository: billingRepository,
    paystackClient: new PaystackClient({ secretKey: config.paystackSecretKey }),
    plans: config.paystackPlans,
    secretKey: config.paystackSecretKey,
    callbackUrl: config.paystackCallbackUrl,
    auditService,
  }) : null;
  const userRoleService = new UserRoleService({ userRepository, auditService, roleFirmResolver });
  const officeActionRefRepository = new OfficeActionRefRepository(pool);
  const officeActionRefService = new OfficeActionRefService({ repository: officeActionRefRepository, auditService });
  const alertGenerationService = config.watchEnabled
    ? new AlertGenerationService({ repository: alertRepository }) : null;
  const watchRuntime = createWatchRuntime({
    config, redisClient, watchRepository, searchService, alertGenerationService,
  });
  // This runtime constructs its Redis queue and private storage only when the
  // explicitly disabled-by-default PDF flag is enabled.
  const pdfExportRuntime = createPdfExportRuntime({
    config, redisClient, database: pool, exportAuditService, searchResultService, portfolioMarkService,
    officeActionRefService, watchService, alertService, storage: exportStorage,
  });

  return {
    app: createApp({
      invitationService,
      authenticate,
      authenticateIdentity,
      provisioningService,
      searchService,
      searchResultService: config.searchEnabled ? searchResultService : null,
      portfolioMarkService,
      watchService: config.watchEnabled ? watchService : null,
      alertService: config.watchEnabled ? alertService : null,
      auditService,
      userRoleService,
      officeActionSearchService,
      officeActionSearchMaxResults: config.officeActionSearchMaxResults,
      officeActionRefService,
      exportService: pdfExportRuntime?.exportService ?? null,
      authRateLimiter,
      trustProxyHops: config.trustProxyHops,
      corsAllowedOrigins: config.corsAllowedOrigins,
      dashboardAnalyticsService,
      billingService,
      readinessChecks: [
        async () => { await pool.query('SELECT 1'); },
        async () => { await redisClient.ping(); },
      ],
    }),
    pool,
    redisClient,
    authRateLimiter,
    authService,
    invitationService,
    invitationRepository,
    organizationProvisioningRepository,
    provisioningService,
    portfolioMarkRepository,
    portfolioMarkService,
    watchRepository,
    watchService,
    watchRuntime,
    pdfExportRuntime,
    exportRepository: pdfExportRuntime?.repository ?? null,
    exportService: pdfExportRuntime?.exportService ?? null,
    alertRepository,
    alertService,
    dashboardAnalyticsService,
    billingRepository,
    billingService,
    auditLogRepository,
    auditService,
    exportAuditService,
    userRoleService,
    officeActionRefRepository,
    officeActionRefService,
    officeActionSources: configuredOfficeActionSources,
    federatedOfficeActionSearchService,
    officeActionSearchService,
    alertGenerationService,
    roleFirmResolver,
    supabaseAdminUserService,
    supabaseVerifier,
    searchSources,
    federatedSearchService,
    searchService,
    searchResultRepository,
    searchResultService,
    async close() {
      await Promise.allSettled([redisClient.quit(), pool.end()]);
    },
  };
}
