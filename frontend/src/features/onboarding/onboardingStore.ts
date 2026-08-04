import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type OnboardingPath = 'search' | 'portfolio';

export interface ClientOnboardingProgress {
  source: 'client-device';
  selectedPath: OnboardingPath | null;
  completedPath: OnboardingPath | null;
  completedAt: string | null;
  updatedAt: string;
}

interface OnboardingState {
  progressByUser: Record<string, ClientOnboardingProgress>;
  selectPath: (userId: string, path: OnboardingPath) => void;
  completePath: (userId: string, path: OnboardingPath) => void;
  clearProgress: (userId: string) => void;
}

const createProgress = (): ClientOnboardingProgress => ({
  source: 'client-device',
  selectedPath: null,
  completedPath: null,
  completedAt: null,
  updatedAt: new Date().toISOString(),
});

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      progressByUser: {},
      selectPath: (userId, path) => set((state) => ({
        progressByUser: {
          ...state.progressByUser,
          [userId]: {
            ...(state.progressByUser[userId] ?? createProgress()),
            source: 'client-device',
            selectedPath: path,
            updatedAt: new Date().toISOString(),
          },
        },
      })),
      completePath: (userId, path) => set((state) => ({
        progressByUser: {
          ...state.progressByUser,
          [userId]: {
            source: 'client-device',
            selectedPath: path,
            completedPath: path,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      })),
      clearProgress: (userId) => set((state) => {
        const progressByUser = { ...state.progressByUser };
        delete progressByUser[userId];
        return { progressByUser };
      }),
    }),
    {
      name: 'forge-client-onboarding-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ progressByUser }) => ({ progressByUser }),
    },
  ),
);

