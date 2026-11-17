import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { Room, RoomPrivacy, RoomSettings, RoomMember, RoomRole } from '@/types/database.types';

const LOCAL_ROOMS_KEY = 'jamroom_local_rooms';

export interface CreateRoomInput {
  name: string;
  slug: string;
  description?: string;
  privacy: RoomPrivacy;
  password?: string;
  settings?: Partial<RoomSettings>;
}

export interface CreateRoomResult {
  room: Room;
  recoveryToken: string;
}

export interface JoinRoomResult {
  success: boolean;
  role: 'owner' | 'moderator' | 'member';
  room: Room;
}

/**
 * Creates a virtual listening room atomically.
 */
export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  const sanitizedSlug = input.slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 40);

  if (isSupabaseConfigured) {
    try {
      // 1. Ensure Supabase auth session is active for auth.uid()
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        try {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          if (anonData?.session) {
            session = anonData.session;
          }
        } catch {
          // Anonymous sign-ins might be disabled on Supabase project
        }
      }

      // If still no Supabase auth session, fall back to local room creation
      if (!session) {
        console.warn('[createRoom] No Supabase auth session active. Creating lounge in local storage.');
        return createLocalRoom(input, sanitizedSlug);
      }

      const { data, error } = await supabase.rpc('rpc_create_room', {
        p_name: input.name.trim(),
        p_slug: sanitizedSlug,
        p_description: input.description?.trim() || null,
        p_privacy: input.privacy,
        p_password: input.password?.trim() || null,
        p_settings: input.settings || {},
      });

      if (!error && data) {
        return {
          room: data.room as Room,
          recoveryToken: data.recovery_token,
        };
      }

      console.warn('[createRoom] RPC error, falling back to local room:', error);
      // Fall back if RPC not in schema cache or if authentication required
      if (
        error?.code === 'PGRST202' ||
        error?.message?.includes('schema cache') ||
        error?.message?.includes('function') ||
        error?.message?.includes('Authentication required')
      ) {
        return createLocalRoom(input, sanitizedSlug);
      }

      throw error;
    } catch (err: any) {
      if (
        err?.code === 'PGRST202' ||
        err?.message?.includes('schema cache') ||
        err?.message?.includes('function') ||
        err?.message?.includes('Authentication required')
      ) {
        return createLocalRoom(input, sanitizedSlug);
      }
      throw err;
    }
  }

  // Local Offline Fallback
  return createLocalRoom(input, sanitizedSlug);
}

/**
 * Fetches an active room by its unique URL slug.
 */
export async function getRoomBySlug(slug: string): Promise<Room | null> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.warn('[getRoomBySlug] Supabase query error:', error);
    }
    if (data) return data as Room;
  }

  // Check local offline storage
  const localRooms = getLocalRooms();
  return localRooms.find((r) => r.slug === slug && r.status === 'active') || null;
}

/**
 * Fetches all public active rooms for the Explore lobby.
 */
export async function getPublicRooms(searchQuery?: string): Promise<Room[]> {
  if (isSupabaseConfigured) {
    let query = supabase
      .from('rooms')
      .select('*')
      .eq('status', 'active')
      .eq('privacy', 'public')
      .order('created_at', { ascending: false });

    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[getPublicRooms] Supabase query error:', error);
    }
    if (data && data.length > 0) return data as Room[];
  }

  // Local fallback
  const localRooms = getLocalRooms().filter((r) => r.status === 'active' && r.privacy === 'public');
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    return localRooms.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  }
  return localRooms;
}

/**
 * Enrolls a guest into a room, validating passcodes if protected.
 */
export async function joinRoom(roomId: string, passcode?: string): Promise<JoinRoomResult> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('rpc_join_room', {
        p_room_id: roomId,
        p_passcode: passcode?.trim() || null,
      });

      if (!error && data) {
        return {
          success: true,
          role: data.role,
          room: data.room as Room,
        };
      }

      if (
        error?.code !== 'PGRST202' &&
        !error?.message?.includes('schema cache') &&
        !error?.message?.includes('function') &&
        !error?.message?.includes('Authentication required')
      ) {
        throw error;
      }
    } catch (err: any) {
      if (
        err?.code !== 'PGRST202' &&
        !err?.message?.includes('schema cache') &&
        !err?.message?.includes('function') &&
        !err?.message?.includes('Authentication required')
      ) {
        throw err;
      }
    }
  }

  // Offline mode join
  const localRooms = getLocalRooms();
  const room = localRooms.find((r) => r.id === roomId);
  if (!room) throw new Error('Room not found');

  return {
    success: true,
    role: 'owner',
    room,
  };
}

/**
 * Claims host room ownership using an Emergency Recovery Token.
 */
export async function claimRoomOwnership(roomId: string, recoveryToken: string): Promise<{ success: boolean; newRecoveryToken: string }> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('rpc_claim_room_ownership', {
      p_room_id: roomId,
      p_recovery_token: recoveryToken.trim(),
    });

    if (error) throw error;
    return {
      success: true,
      newRecoveryToken: data.new_recovery_token,
    };
  }

  return { success: true, newRecoveryToken: 'jam-local-rotated' };
}

/**
 * Heartbeat activity ping for skip vote denominator accuracy.
 */
export async function touchMemberActivity(roomId: string): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.rpc('rpc_touch_member_activity', { p_room_id: roomId });
  }
}

/**
 * Updates room metadata and settings. Caller must have owner/moderator role per RLS.
 */
export async function updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('rooms')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .select()
      .single();

    if (error) throw error;
    return data as Room;
  }

  // Local fallback
  const rooms = getLocalRooms();
  const idx = rooms.findIndex((r) => r.id === roomId);
  if (idx === -1) throw new Error('Room not found');
  rooms[idx] = { ...rooms[idx], ...updates, updated_at: new Date().toISOString() };
  localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms));
  return rooms[idx];
}

/**
 * Retrieves enrolled room members with their profiles.
 */
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('room_members')
      .select('*, profile:profiles(*)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.warn('[getRoomMembers] error:', error);
      return [];
    }
    return (data || []) as RoomMember[];
  }

  return [];
}

/**
 * Updates a member's role (promote/demote).
 */
export async function updateMemberRole(roomId: string, userId: string, role: RoomRole): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('room_members')
      .update({ role })
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

/**
 * Removes (kicks) a member from a room.
 */
export async function kickMember(roomId: string, userId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

/**
 * Transfers room ownership to another user.
 */
export async function transferRoomOwnership(roomId: string, newOwnerId: string): Promise<void> {
  if (isSupabaseConfigured) {
    // 1. Update room owner_id
    const { error: roomErr } = await supabase
      .from('rooms')
      .update({ owner_id: newOwnerId })
      .eq('id', roomId);
    if (roomErr) throw roomErr;

    // 2. Set new owner's role to 'owner'
    await supabase
      .from('room_members')
      .update({ role: 'owner' })
      .eq('room_id', roomId)
      .eq('user_id', newOwnerId);
  }
}

// ----------------------------------------------------------------------------
// Local Storage Offline Helpers
// ----------------------------------------------------------------------------
function getLocalRooms(): Room[] {
  try {
    const stored = localStorage.getItem(LOCAL_ROOMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function createLocalRoom(input: CreateRoomInput, slug: string): CreateRoomResult {
  const localRooms = getLocalRooms();
  const newRoom: Room = {
    id: crypto.randomUUID(),
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    cover_url: null,
    privacy: input.privacy,
    owner_id: 'local-owner',
    status: 'active',
    max_members: 50,
    settings: {
      shared_speakers: input.settings?.shared_speakers ?? false,
      add_to_queue_permission: 'anyone',
      reorder_queue_permission: 'host_and_mods_only',
      vote_skip_enabled: true,
      skip_vote_threshold_percent: 50,
      max_queue_items_per_user: 5,
      chat_enabled: true,
      auto_play_on_queue_add: true,
      ...input.settings,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  localRooms.unshift(newRoom);
  localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(localRooms));

  const recoveryToken = `jam-${crypto.randomUUID().slice(0, 8)}`;
  return {
    room: newRoom,
    recoveryToken,
  };
}
