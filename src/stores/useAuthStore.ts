import { create } from 'zustand';
import type { Profile } from '@/types/database.types';

interface AuthState {
  user: { id: string; is_anonymous: boolean } | null;
  profile: Profile | null;
  isLoading: boolean;
  isOnboardingOpen: boolean;
  setUser: (user: { id: string; is_anonymous: boolean } | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsOnboardingOpen: (open: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isOnboardingOpen: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsOnboardingOpen: (isOnboardingOpen) => set({ isOnboardingOpen }),
}));
