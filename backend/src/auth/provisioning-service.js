import { badRequest, conflict, forbidden, gone } from '../errors.js';
import { createOpaqueInvitationToken, hashOpaqueToken } from './invitation-token.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const displayFirmName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
const publicUser = (user) => ({ id: user.id, firmId: user.firmId, email: user.email, role: user.role });

export class ProvisioningService {
  constructor({ organizationProvisioningRepository, roleFirmResolver, supabaseAdminUserService, firmSignupEnabled = false, organizationIntentTtlSeconds = 3_600 }) {
    this.organizationProvisioningRepository = organizationProvisioningRepository;
    this.roleFirmResolver = roleFirmResolver;
    this.supabaseAdminUserService = supabaseAdminUserService;
    this.firmSignupEnabled = firmSignupEnabled;
    this.organizationIntentTtlSeconds = organizationIntentTtlSeconds;
  }

  ensureSignupEnabled() {
    if (!this.firmSignupEnabled) throw forbidden('Public organization creation is disabled. Request an invitation from a firm Administrator.');
  }

  async startOrganizationIntent(input) {
    this.ensureSignupEnabled();
    const email = normalizeEmail(input?.email);
    const firmName = displayFirmName(input?.firmName);
    if (!EMAIL_PATTERN.test(email)) throw badRequest('VALIDATION_ERROR', 'Enter a valid email address.', { field: 'email' });
    if (firmName.length < 2) throw badRequest('VALIDATION_ERROR', 'Firm name is required.', { field: 'firmName' });
    const token = createOpaqueInvitationToken();
    const expiresAt = new Date(Date.now() + (this.organizationIntentTtlSeconds * 1_000));
    await this.organizationProvisioningRepository.createIntent({ tokenHash: hashOpaqueToken(token), email, firmName, expiresAt });
    return { intentToken: token, expiresAt: expiresAt.toISOString() };
  }

  async provisionFirm(auth, input) {
    this.ensureSignupEnabled();
    if (auth?.supabaseRole !== 'authenticated' || typeof auth.userId !== 'string' || !UUID_PATTERN.test(auth.userId)) {
      throw forbidden('A verified Supabase user is required to provision a firm.');
    }
    const email = normalizeEmail(auth.email);
    if (!EMAIL_PATTERN.test(email)) throw badRequest('VERIFIED_EMAIL_REQUIRED', 'The verified Supabase identity must include an email address.');
    const tokenHash = hashOpaqueToken(input?.intentToken);
    if (!tokenHash) throw badRequest('VALIDATION_ERROR', 'Organization creation intent is invalid.', { field: 'intentToken' });
    let authoritative;
    try { authoritative = await this.supabaseAdminUserService.getAuthoritativeUser(auth.userId); }
    catch { throw forbidden('A verified Supabase identity is required to create an organization.'); }
    if (!authoritative?.emailConfirmed || normalizeEmail(authoritative.email) !== email) {
      throw forbidden('Verify your email address before creating an organization.');
    }
    let user;
    try {
      user = await this.organizationProvisioningRepository.createFirmFromIntent({ tokenHash, email, supabaseUserId: auth.userId });
    } catch (error) {
      if (error?.code === 'FIRM_NAME_EXISTS') throw conflict('FIRM_ALREADY_EXISTS', 'This firm may already exist. Request an invitation from your firm administrator.');
      if (error?.code === 'INTENT_INVALID') throw gone('ORGANIZATION_INTENT_INVALID', 'This organization-creation request is invalid or has expired. Start again.');
      if (error?.code === '23505') throw conflict('DUPLICATE_ACCOUNT', 'This identity is already linked to an organization.');
      throw error;
    }
    await this.roleFirmResolver.invalidate(auth.userId);
    return { user: publicUser(user), firm: user.firm };
  }
}
