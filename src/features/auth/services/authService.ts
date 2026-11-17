import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { Profile } from '@/types/database.types';

const LOCAL_STORAGE_GUEST_KEY = 'jamroom_guest_profile';

export interface GuestSessionResult {
  user: { id: string; is_anonymous: boolean };
  profile: Profile;
  isNewGuest: boolean;
}

/**
 * Initializes or restores the guest session.
 * Guarantees zero registration barriers with persistent UUID identity.
 */
export async function initializeGuestSession(): Promise<GuestSessionResult> {
  // 1. Production Mode with Supabase
  if (isSupabaseConfigured) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      let userId = session?.user?.id;
      let isNewGuest = false;

      // If no valid session, sign in anonymously
      if (!userId) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        userId = anonData.user?.id;
        isNewGuest = true;
      }

      if (!userId) throw new Error('Failed to resolve guest identity');

      // Fetch or poll profile from public.profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const profile: Profile = profileData || {
        id: userId,
        username: `guest_${userId.slice(0, 6)}`,
        display_name: `Guest ${userId.slice(0, 4)}`,
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };

      // Check if user still has default placeholder name
      if (profile.display_name.startsWith('Guest ')) {
        isNewGuest = true;
      }

      return {
        user: { id: userId, is_anonymous: true },
        profile,
        isNewGuest,
      };
    } catch (err) {
      console.warn('[JAMROOM Auth] Supabase remote sign-in failed, falling back to local guest storage:', err);
    }
  }

  // 2. Offline / Local Development Fallback
  return getOrCreateLocalGuestSession();
}

/**
 * Local offline guest session manager (persisted in localStorage).
 */
function getOrCreateLocalGuestSession(): GuestSessionResult {
  const stored = localStorage.getItem(LOCAL_STORAGE_GUEST_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Profile;
      return {
        user: { id: parsed.id, is_anonymous: true },
        profile: parsed,
        isNewGuest: parsed.display_name.startsWith('Guest '),
      };
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_GUEST_KEY);
    }
  }

  // Generate new guest UUID
  const newId = crypto.randomUUID();
  const suffix = newId.slice(0, 4);
  const newProfile: Profile = {
    id: newId,
    username: `guest_${newId.slice(0, 6)}`,
    display_name: `Guest ${suffix}`,
    avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${newId}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };

  localStorage.setItem(LOCAL_STORAGE_GUEST_KEY, JSON.stringify(newProfile));

  return {
    user: { id: newId, is_anonymous: true },
    profile: newProfile,
    isNewGuest: true,
  };
}

/**
 * Updates guest display name and avatar in backend & localStorage.
 */
export async function updateGuestProfile(
  userId: string,
  displayName: string,
  avatarUrl?: string
): Promise<Profile> {
  const sanitizedName = displayName.trim().slice(0, 30);
  if (!sanitizedName) throw new Error('Display name cannot be empty');

  const updates: Partial<Profile> = {
    display_name: sanitizedName,
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };

  if (avatarUrl) {
    updates.avatar_url = avatarUrl;
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (!error && data) {
      localStorage.setItem(LOCAL_STORAGE_GUEST_KEY, JSON.stringify(data));
      return data as Profile;
    }
  }

  // Fallback update
  const stored = localStorage.getItem(LOCAL_STORAGE_GUEST_KEY);
  const current = stored ? JSON.parse(stored) : { id: userId };
  const updated: Profile = {
    ...current,
    ...updates,
    id: userId,
    avatar_url: avatarUrl || current.avatar_url,
  };

  localStorage.setItem(LOCAL_STORAGE_GUEST_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Exports a compact base64 identity backup string to protect against Safari ITP storage purges.
 */
export function exportGuestSessionString(profile: Profile): string {
  const payload = {
    id: profile.id,
    name: profile.display_name,
    avatar: profile.avatar_url,
    created: profile.created_at,
  };
  return btoa(JSON.stringify(payload));
}

/**
 * Restores a guest identity from an exported backup string.
 */
export function restoreGuestSessionString(backupString: string): Profile {
  try {
    const raw = atob(backupString.trim());
    const data = JSON.parse(raw);
    if (!data.id || !data.name) throw new Error('Invalid identity token format');

    const restored: Profile = {
      id: data.id,
      username: `guest_${data.id.slice(0, 6)}`,
      display_name: data.name,
      avatar_url: data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.id}`,
      created_at: data.created || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    localStorage.setItem(LOCAL_STORAGE_GUEST_KEY, JSON.stringify(restored));
    return restored;
  } catch (e) {
    throw new Error('Failed to restore identity: Invalid recovery string');
  }
}
