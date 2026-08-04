import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserRole } from '../../types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified?: boolean;
  onboardingRequired?: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthenticatedUser | null;
  expiresAt: number | null;
  setSession: (token: string, user: AuthenticatedUser, expiresAt?: number) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      expiresAt: null,
      setSession: (token, user, expiresAt = Date.now() + 60 * 60 * 1_000) => set({ token, user, expiresAt }),
      clearSession: () => set({ token: null, user: null, expiresAt: null }),
    }),
    {
      name: 'forge-auth-session',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ token, user, expiresAt }) => ({ token, user, expiresAt }),
    },
  ),
);

export const isSessionExpired = (expiresAt: number | null) =>
  expiresAt !== null && expiresAt <= Date.now();
