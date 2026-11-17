import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import { formatDuration } from '@/features/player/services/youtubeService';
import type { Room, RoomPrivacy, RoomSettings, RoomMember, RoomRole, RoomCategory } from '@/types/database.types';

const LOCAL_ROOMS_KEY = 'jamroom_local_rooms';

export const DEFAULT_ROOM_CATEGORIES: RoomCategory[] = [
  { id: 'cat-pop', name: 'Pop', slug: 'pop', description: 'Catchy mainstream pop, dance-pop, and chart toppers' },
  { id: 'cat-rock', name: 'Rock', slug: 'rock', description: 'Classic rock, alternative, hard rock, and guitar riffs' },
  { id: 'cat-jazz', name: 'Jazz', slug: 'jazz', description: 'Smooth jazz, bebop, fusion, and late-night brass lounge' },
  { id: 'cat-r-and-b', name: 'R&B', slug: 'r-and-b', description: 'Rhythm and blues, soul, contemporary neo-soul' },
  { id: 'cat-hip-hop', name: 'Hip Hop', slug: 'hip-hop', description: 'Boom bap, trap, 90s golden age, and conscious beats' },
  { id: 'cat-electronic', name: 'Electronic', slug: 'electronic', description: 'EDM, house, techno, ambient, and synthesizer waves' },
  { id: 'cat-indie', name: 'Indie', slug: 'indie', description: 'Indie rock, dream pop, bedroom lo-fi, and shoegaze' },
  { id: 'cat-dangdut', name: 'Dangdut', slug: 'dangdut', description: 'Indonesian modern and classic dangdut rhythms' },
  { id: 'cat-classical', name: 'Classical', slug: 'classical', description: 'Symphonic orchestra, piano sonatas, and modern cinematic ambient' },
  { id: 'cat-k-pop', name: 'K-Pop', slug: 'k-pop', description: 'Korean pop music, high energy dance and idol tracks' },
  { id: 'cat-j-pop', name: 'J-Pop', slug: 'j-pop', description: 'Japanese pop, city pop, and anime original soundtracks' },
  { id: 'cat-lo-fi', name: 'Lo-fi', slug: 'lo-fi', description: 'Chillhop, lofi beats, vinyl crackles, study & deep focus' },
  { id: 'cat-mixed-other', name: 'Mixed / Other', slug: 'mixed-other', description: 'Eclectic multi-genre mix and freeform listening' },
];

/**
 * Fetches all available room categories.
 */
export async function fetchRoomCategories(): Promise<RoomCategory[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('room_categories')
        .select('*')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as RoomCategory[];
      }
    } catch (err) {
      console.warn('[fetchRoomCategories] Supabase query notice:', err);
    }
  }
  return DEFAULT_ROOM_CATEGORIES;
}

export interface ActiveRoomSummary extends Room {
  host?: string;
  current_song?: string;
  duration?: string;
  members_count?: number;
  shared_speakers?: boolean;
}

export interface CreateRoomInput {
  name: string;
  slug: string;
  description?: string;
  privacy: RoomPrivacy;
  password?: string;
  categoryId?: string;
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

      let { data, error } = await supabase.rpc('rpc_create_room', {
        p_name: input.name.trim(),
        p_slug: sanitizedSlug,
        p_description: input.description?.trim() || null,
        p_privacy: input.privacy,
        p_password: input.password?.trim() || null,
        p_settings: input.settings || {},
        p_category_id: input.categoryId || null,
      });

      // Backward-compatibility: If database function hasn't been migrated yet, retry without p_category_id
      if (error && (error.message?.includes('p_category_id') || error.code === 'PGRST202')) {
        const retry = await supabase.rpc('rpc_create_room', {
          p_name: input.name.trim(),
          p_slug: sanitizedSlug,
          p_description: input.description?.trim() || null,
          p_privacy: input.privacy,
          p_password: input.password?.trim() || null,
          p_settings: input.settings || {},
        });
        if (!retry.error && retry.data) {
          data = retry.data;
          error = null;
          if (input.categoryId && data.room?.id) {
            await supabase.from('rooms').update({ category_id: input.categoryId }).eq('id', data.room.id);
            if (data.room) data.room.category_id = input.categoryId;
          }
        }
      }

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
      .select('*, category:room_categories(*)')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (!error && data) return data as Room;

    // Fallback if join is unavailable
    const fallback = await supabase
      .from('rooms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (fallback.data) {
      const room = fallback.data as Room;
      if (room.category_id && !room.category) {
        room.category = DEFAULT_ROOM_CATEGORIES.find((c) => c.id === room.category_id) || null;
      }
      return room;
    }

    if (error) {
      console.warn('[getRoomBySlug] Supabase query error:', error);
    }
  }

  // Check local offline storage
  const localRooms = getLocalRooms();
  return localRooms.find((r) => r.slug === slug && r.status === 'active') || null;
}

/**
 * Fetches all public active rooms for the Explore lobby and homepage,
 * enriched with live host profile, currently playing song, member counts, and category.
 */
export async function getPublicRooms(searchQuery?: string, categorySlug?: string): Promise<ActiveRoomSummary[]> {
  const resultRooms: ActiveRoomSummary[] = [];

  if (isSupabaseConfigured) {
    try {
      // 1. Attempt joined query with category, owner profile, and current playback state
      let query = supabase
        .from('rooms')
        .select(`
          *,
          category:room_categories(*),
          owner:profiles(display_name, username),
          playback_state:playback_states(
            is_playing,
            position_seconds,
            current_song:songs(id, title, artist_channel, duration_seconds)
          ),
          members:room_members(count)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (searchQuery && searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      let { data, error } = await query;

      // If joined foreign keys failed (e.g. relationship naming), fallback to direct select
      if (error) {
        let fallbackQuery = supabase
          .from('rooms')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (searchQuery && searchQuery.trim()) {
          fallbackQuery = fallbackQuery.ilike('name', `%${searchQuery.trim()}%`);
        }

        const fallbackRes = await fallbackQuery;
        data = fallbackRes.data;
      }

      if (data && data.length > 0) {
        data.forEach((r: any) => {
          const ownerProfile = r.owner;
          const hostName = ownerProfile?.display_name || ownerProfile?.username || 'DJ Host';
          const pb = Array.isArray(r.playback_state) ? r.playback_state[0] : r.playback_state;
          const song = pb?.current_song;
          const durSec = song?.duration_seconds || 0;
          const cat = r.category || (r.category_id ? DEFAULT_ROOM_CATEGORIES.find((c) => c.id === r.category_id) : null);

          resultRooms.push({
            ...r,
            category: cat || null,
            host: hostName,
            current_song: song?.title || (pb?.is_playing ? 'Playing Audio' : 'Lounge Idle'),
            duration: durSec > 0 ? formatDuration(durSec) : '--:--',
            members_count: (Array.isArray(r.members) && r.members[0]?.count) || 1,
            shared_speakers: Boolean(r.settings?.shared_speakers),
          });
        });
      }
    } catch (err) {
      console.warn('[getPublicRooms] Supabase fetch warning:', err);
    }
  }

  // Also include any local rooms created offline/locally if not already in results
  const localRooms = getLocalRooms().filter((r) => r.status === 'active');
  for (const lr of localRooms) {
    if (!resultRooms.some((r) => r.slug === lr.slug || r.id === lr.id)) {
      if (
        !searchQuery ||
        lr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lr.slug.includes(searchQuery.toLowerCase())
      ) {
        resultRooms.push({
          ...lr,
          host: 'Local Host',
          current_song: 'Lounge Idle',
          duration: '--:--',
          members_count: 1,
          shared_speakers: Boolean(lr.settings?.shared_speakers),
        });
      }
    }
  }

  // Filter by category slug if provided and not 'all'
  if (categorySlug && categorySlug !== 'all') {
    return resultRooms.filter((r) => {
      const cSlug = r.category?.slug || (r.category_id ? DEFAULT_ROOM_CATEGORIES.find((c) => c.id === r.category_id)?.slug : null);
      return cSlug === categorySlug;
    });
  }

  return resultRooms;
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
      .select('*, category:room_categories(*)')
      .single();

    if (!error && data) return data as Room;

    // Fallback if join select is unavailable
    const fallback = await supabase
      .from('rooms')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .select('*')
      .single();

    if (fallback.error) throw fallback.error;
    const room = fallback.data as Room;
    if (room.category_id && !room.category) {
      room.category = DEFAULT_ROOM_CATEGORIES.find((c) => c.id === room.category_id) || null;
    }
    return room;
  }

  // Local fallback
  const rooms = getLocalRooms();
  const idx = rooms.findIndex((r) => r.id === roomId);
  if (idx === -1) throw new Error('Room not found');
  const cat = updates.category_id
    ? DEFAULT_ROOM_CATEGORIES.find((c) => c.id === updates.category_id) || null
    : rooms[idx].category;

  rooms[idx] = {
    ...rooms[idx],
    ...updates,
    category: cat || rooms[idx].category,
    updated_at: new Date().toISOString(),
  };
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
    let rpcSuccess = false;
    try {
      const { data, error } = await supabase.rpc('rpc_kick_member', {
        p_room_id: roomId,
        p_target_user_id: userId,
      });
      if (!error && data?.success) {
        rpcSuccess = true;
      } else if (error && error.code !== 'PGRST202' && !error.message?.includes('function')) {
        throw error;
      }
    } catch (err: any) {
      if (err?.code !== 'PGRST202' && !err?.message?.includes('function')) {
        throw err;
      }
    }

    if (!rpcSuccess) {
      // Direct DELETE fallback
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId);

      if (error) throw error;
    }

    // Broadcast member kicked event over Realtime channel so kicked client is immediately ejected
    try {
      const channel = supabase.channel(`presence_${roomId}`);
      await channel.send({
        type: 'broadcast',
        event: 'member_kicked',
        payload: { userId, roomId },
      });
    } catch {
      // Non-critical broadcast warning
    }
  }
}

/**
 * Cleanly leaves a room for the authenticated participant.
 */
export async function leaveRoom(roomId: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.rpc('rpc_leave_room', { p_room_id: roomId });
      if (!error) return;
    } catch {
      // Fallback
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId);
    }
  }
}

/**
 * Cleans up inactive or disconnected guest members whose heartbeat expired.
 */
export async function cleanupInactiveMembers(roomId: string, maxIdleSeconds: number = 120): Promise<number> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('rpc_cleanup_inactive_members', {
        p_room_id: roomId,
        p_max_idle_seconds: maxIdleSeconds,
      });
      if (!error && data?.purged_count !== undefined) {
        return data.purged_count;
      }
    } catch {
      // Fallback
    }

    // Direct fallback
    const threshold = new Date(Date.now() - maxIdleSeconds * 1000).toISOString();
    const { data } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .neq('role', 'owner')
      .lt('last_active_at', threshold)
      .select('user_id');

    return data ? data.length : 0;
  }
  return 0;
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
  const category = input.categoryId
    ? DEFAULT_ROOM_CATEGORIES.find((c) => c.id === input.categoryId || c.slug === input.categoryId) ||
      DEFAULT_ROOM_CATEGORIES.find((c) => c.slug === 'lo-fi')
    : DEFAULT_ROOM_CATEGORIES.find((c) => c.slug === 'lo-fi');

  const newRoom: Room = {
    id: crypto.randomUUID(),
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    cover_url: null,
    privacy: input.privacy,
    owner_id: 'local-owner',
    category_id: category?.id || null,
    category: category || null,
    status: 'active',
    max_members: 50,
    settings: {
      shared_speakers: input.settings?.shared_speakers ?? false,
      add_to_queue_permission: 'anyone',
      reorder_queue_permission: 'host_and_mods_only',
      delete_queue_permission: 'host_and_mods_only',
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
