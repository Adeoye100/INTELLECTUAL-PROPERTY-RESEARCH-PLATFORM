import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserRole } from '../../types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthState {
  token: string | null;
  user: AuthenticatedUser | null;
  setSession: (token: string, user: AuthenticatedUser) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    {
      name: 'forge-auth-session',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ token, user }) => ({ token, user }),
    },
  ),
);

