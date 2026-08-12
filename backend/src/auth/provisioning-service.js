import { badRequest, conflict, forbidden } from '../errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const normalizeFirmName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const displayFirmName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

const publicUser = (user) => ({
  id: user.id,
  firmId: user.firmId,
  email: user.email,
  role: user.role,
});

export class ProvisioningService {
  constructor({ userRepository, roleFirmResolver }) {
    this.userRepository = userRepository;
    this.roleFirmResolver = roleFirmResolver;
  }

  async provisionFirm(auth, input) {
    if (
      auth?.supabaseRole !== 'authenticated'
      || typeof auth.userId !== 'string'
      || !UUID_PATTERN.test(auth.userId)
    ) {
      throw forbidden('A verified Supabase user is required to provision a firm.');
    }

    const email = normalizeEmail(auth.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw badRequest('VERIFIED_EMAIL_REQUIRED', 'The verified Supabase identity must include an email address.');
    }

    const firmName = displayFirmName(input?.firmName);
    const normalizedFirmName = normalizeFirmName(firmName);
    if (firmName.length < 2) {
      throw badRequest('VALIDATION_ERROR', 'Firm name is required.', { field: 'firmName' });
    }

    let user;
    try {
      user = await this.userRepository.createFirmForSupabaseIdentity({
        firmName,
        normalizedFirmName,
        email,
        supabaseUserId: auth.userId,
      });
    } catch (error) {
      if (error?.code === 'FIRM_NAME_EXISTS') {
        throw conflict(
          'FIRM_ALREADY_EXISTS',
          'This firm may already exist. Request an invitation from your firm administrator.',
        );
      }
      if (error?.code === '23505' && error?.constraint === 'users_email_key') {
        throw conflict('DUPLICATE_ACCOUNT', 'An account already exists for this email address.');
      }
      if (error?.code === '23505' && error?.constraint === 'users_supabase_user_id_key') {
        throw conflict('DUPLICATE_ACCOUNT', 'This Supabase identity is already provisioned.');
      }
      throw error;
    }

    await this.roleFirmResolver.invalidate(auth.userId);
    return { user: publicUser(user), firm: user.firm };
  }
}
