import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  initializeGuestSession,
  updateGuestProfile,
  exportGuestSessionString,
  restoreGuestSessionString,
} from '../services/authService';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isOnboardingOpen = useAuthStore((s) => s.isOnboardingOpen);
  const setUser = useAuthStore((s) => s.setUser);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setIsLoading = useAuthStore((s) => s.setIsLoading);
  const setIsOnboardingOpen = useAuthStore((s) => s.setIsOnboardingOpen);

  // Initialize guest identity on mount
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        setIsLoading(true);
        const { user: sessionUser, profile: sessionProfile, isNewGuest } =
          await initializeGuestSession();

        if (isMounted) {
          setUser(sessionUser);
          setProfile(sessionProfile);

          // Prompt first-time guests to choose a personalized display name
          if (isNewGuest) {
            setIsOnboardingOpen(true);
          }
        }
      } catch (err) {
        console.error('[useAuth] Guest session initialization error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (!user) {
      init();
    }
  }, [user, setUser, setProfile, setIsLoading, setIsOnboardingOpen]);

  const updateProfile = useCallback(
    async (displayName: string, avatarUrl?: string) => {
      if (!user) throw new Error('No active guest session');
      const updated = await updateGuestProfile(user.id, displayName, avatarUrl);
      setProfile(updated);
      return updated;
    },
    [user, setProfile]
  );

  const exportBackup = useCallback(() => {
    if (!profile) return '';
    return exportGuestSessionString(profile);
  }, [profile]);

  const restoreBackup = useCallback(
    (backupString: string) => {
      const restored = restoreGuestSessionString(backupString);
      setUser({ id: restored.id, is_anonymous: true });
      setProfile(restored);
      return restored;
    },
    [setUser, setProfile]
  );

  return {
    user,
    profile,
    isLoading,
    isOnboardingOpen,
    setIsOnboardingOpen,
    updateProfile,
    exportBackup,
    restoreBackup,
  };
}
