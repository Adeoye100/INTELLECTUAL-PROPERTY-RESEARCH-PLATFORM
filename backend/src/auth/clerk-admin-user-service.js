import { createClerkClient } from '@clerk/backend';

export class ClerkAdminUserService {
  constructor({ secretKey, clerkClient }) {
    if (!secretKey && !clerkClient) {
      throw new TypeError('ClerkAdminUserService requires secretKey or clerkClient.');
    }
    this.clerkClient = clerkClient || createClerkClient({ secretKey: secretKey.trim() });
  }

  async getAuthoritativeUser(clerkUserId) {
    if (typeof clerkUserId !== 'string' || !clerkUserId.trim()) {
      const error = new Error('Clerk user ID is invalid.');
      error.code = 'CLERK_ADMIN_USER_ID_INVALID';
      throw error;
    }

    let user;
    try {
      user = await this.clerkClient.users.getUser(clerkUserId.trim());
    } catch (cause) {
      const error = new Error('Clerk Admin API could not verify user identity.', { cause });
      error.code = 'CLERK_ADMIN_UNAVAILABLE';
      throw error;
    }

    if (!user || typeof user !== 'object') {
      const error = new Error('Clerk Admin API returned an invalid user record.');
      error.code = 'CLERK_ADMIN_RESPONSE_INVALID';
      throw error;
    }

    const primaryEmailObj = user.emailAddresses?.find(
      (entry) => entry.id === user.primaryEmailAddressId,
    ) || user.emailAddresses?.[0];

    const email = primaryEmailObj?.emailAddress || '';
    const emailConfirmed = primaryEmailObj?.verification?.status === 'verified';

    return {
      email,
      emailConfirmed,
    };
  }
}
