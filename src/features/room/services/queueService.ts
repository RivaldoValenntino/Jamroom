import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { QueueItem, PlaybackState, Song } from '@/types/database.types';

const LOCAL_QUEUE_KEY_PREFIX = 'jamroom_local_queue_';
const LOCAL_PLAYBACK_KEY_PREFIX = 'jamroom_local_playback_';

export interface RoomQueueData {
  currentItem: QueueItem | null;
  upcoming: QueueItem[];
}

export interface AddTrackPayload {
  youtubeId: string;
  title: string;
  artistChannel: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

/**
 * Fetches the current active playing track and upcoming queue items.
 */
export async function fetchRoomQueue(roomId: string): Promise<RoomQueueData> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('queue_items')
      .select('*, song:songs(*), added_by_profile:profiles(*)')
      .eq('room_id', roomId)
      .in('status', ['playing', 'queued'])
      .order('position', { ascending: true });

    if (error) {
      console.warn('[fetchRoomQueue] Supabase error:', error);
      return { currentItem: null, upcoming: [] };
    }

    const items = (data || []) as QueueItem[];
    const currentItem = items.find((i) => i.status === 'playing') || null;
    const upcoming = items.filter((i) => i.status === 'queued');

    return { currentItem, upcoming };
  }

  // Local offline fallback
  const stored = getLocalQueue(roomId);
  const currentItem = stored.find((i) => i.status === 'playing') || null;
  const upcoming = stored.filter((i) => i.status === 'queued');
  return { currentItem, upcoming };
}

/**
 * Fetches the authoritative playback state for the room.
 */
export async function fetchPlaybackState(roomId: string): Promise<PlaybackState | null> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('playback_states')
      .select('*, current_song:songs(*)')
      .eq('room_id', roomId)
      .maybeSingle();

    if (error) {
      console.warn('[fetchPlaybackState] error:', error);
      return null;
    }
    return data as PlaybackState;
  }

  return getLocalPlayback(roomId);
}

/**
 * Adds a new song to the collaborative room queue.
 */
export async function addTrackToQueue(
  roomId: string,
  track: AddTrackPayload
): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.rpc('rpc_add_queue_item', {
        p_room_id: roomId,
        p_youtube_id: track.youtubeId,
        p_title: track.title,
        p_artist_channel: track.artistChannel,
        p_duration_seconds: track.durationSeconds,
        p_thumbnail_url: track.thumbnailUrl,
      });

      if (!error) return;
      if (
        error.code !== 'PGRST202' &&
        !error.message?.includes('schema cache') &&
        !error.message?.includes('Authentication required')
      ) {
        throw error;
      }
    } catch (err: any) {
      if (
        err?.code !== 'PGRST202' &&
        !err?.message?.includes('schema cache') &&
        !err?.message?.includes('Authentication required')
      ) {
        throw err;
      }
    }
  }

  // Offline mock insertion
  const queue = getLocalQueue(roomId);
  const isFirst = queue.length === 0;

  const newSong: Song = {
    id: crypto.randomUUID(),
    youtube_id: track.youtubeId,
    title: track.title,
    artist_channel: track.artistChannel,
    duration_seconds: track.durationSeconds,
    thumbnail_url: track.thumbnailUrl,
    raw_metadata: {},
    created_at: new Date().toISOString(),
  };

  const newItem: QueueItem = {
    id: crypto.randomUUID(),
    room_id: roomId,
    song_id: newSong.id,
    added_by: 'local-guest',
    position: (queue.length + 1) * 1000,
    status: isFirst ? 'playing' : 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    song: newSong,
    added_by_profile: {
      id: 'local-guest',
      username: 'you',
      display_name: 'You',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
  };

  queue.push(newItem);
  setLocalQueue(roomId, queue);

  if (isFirst) {
    setLocalPlayback(roomId, {
      room_id: roomId,
      current_queue_item_id: newItem.id,
      current_song_id: newSong.id,
      is_playing: true,
      position_seconds: 0,
      server_updated_at: new Date().toISOString(),
      playback_version: 1,
      updated_by: 'local-guest',
      updated_at: new Date().toISOString(),
      current_song: newSong,
    });
  }
}

/**
 * Removes an item from the queue immediately.
 * If the item being deleted is currently playing, smoothly advances playback to the next song.
 */
export async function removeQueueItem(roomId: string, queueItemId: string): Promise<void> {
  if (isSupabaseConfigured) {
    // 1. Check if the item being deleted is currently playing
    const { data: item } = await supabase
      .from('queue_items')
      .select('status')
      .eq('id', queueItemId)
      .maybeSingle();

    const isCurrentPlaying = item?.status === 'playing';

    // 2. Delete the queue item
    const { error } = await supabase.from('queue_items').delete().eq('id', queueItemId);
    if (error) throw error;

    // 3. If it was playing, advance to next track atomically
    if (isCurrentPlaying) {
      try {
        await advanceToNextSong(roomId);
      } catch (err) {
        console.warn('[removeQueueItem] Auto-advance warning:', err);
      }
    }
    return;
  }

  // Local Storage Fallback
  const queue = getLocalQueue(roomId);
  const targetItem = queue.find((i) => i.id === queueItemId);
  const wasPlaying = targetItem?.status === 'playing';

  const updatedQueue = queue.filter((i) => i.id !== queueItemId);
  setLocalQueue(roomId, updatedQueue);

  if (wasPlaying) {
    const nextItem = updatedQueue.find((i) => i.status === 'queued');
    if (nextItem) {
      nextItem.status = 'playing';
      setLocalQueue(roomId, updatedQueue);
      setLocalPlayback(roomId, {
        room_id: roomId,
        current_queue_item_id: nextItem.id,
        current_song_id: nextItem.song_id,
        is_playing: true,
        position_seconds: 0,
        server_updated_at: new Date().toISOString(),
        playback_version: Date.now(),
        updated_by: 'host',
        updated_at: new Date().toISOString(),
        current_song: nextItem.song,
      });
    } else {
      setLocalPlayback(roomId, null);
    }
  }
}

/**
 * Advances playback to the next queued track.
 */
export async function advanceToNextSong(roomId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.rpc('rpc_advance_to_next_song', {
      p_room_id: roomId,
    });
    if (error) throw error;
    return;
  }

  // Local advance
  const queue = getLocalQueue(roomId);
  const currentIdx = queue.findIndex((i) => i.status === 'playing');
  if (currentIdx !== -1) {
    queue[currentIdx].status = 'played';
  }

  const nextItem = queue.find((i) => i.status === 'queued');
  if (nextItem) {
    nextItem.status = 'playing';
    setLocalPlayback(roomId, {
      room_id: roomId,
      current_queue_item_id: nextItem.id,
      current_song_id: nextItem.song_id,
      is_playing: true,
      position_seconds: 0,
      server_updated_at: new Date().toISOString(),
      playback_version: 2,
      updated_by: 'local-guest',
      updated_at: new Date().toISOString(),
      current_song: nextItem.song,
    });
  } else {
    setLocalPlayback(roomId, null);
  }

  setLocalQueue(roomId, queue);
}

/**
 * Sets authoritative playback state (play/pause/seek).
 */
export async function updatePlayback(
  roomId: string,
  isPlaying: boolean,
  positionSeconds: number,
  expectedVersion: number
): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.rpc('rpc_set_playback_state', {
      p_room_id: roomId,
      p_is_playing: isPlaying,
      p_position_seconds: positionSeconds,
      p_expected_version: expectedVersion,
    });
    if (error) throw error;
    return;
  }

  const pb = getLocalPlayback(roomId);
  if (pb) {
    pb.is_playing = isPlaying;
    pb.position_seconds = positionSeconds;
    pb.server_updated_at = new Date().toISOString();
    pb.playback_version += 1;
    setLocalPlayback(roomId, pb);
  }
}

/**
 * Atomically reorders a queue item using fractional indexing.
 */
export async function reorderQueueItem(
  roomId: string,
  queueItemId: string,
  newPosition: number
): Promise<void> {
  if (isSupabaseConfigured) {
    let rpcSuccess = false;
    try {
      const { data, error } = await supabase.rpc('rpc_reorder_queue', {
        p_room_id: roomId,
        p_queue_item_id: queueItemId,
        p_new_position: newPosition,
      });
      if (!error && (data?.success || data === true)) {
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
      // Direct UPDATE fallback
      const { error } = await supabase
        .from('queue_items')
        .update({
          position: newPosition,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueItemId)
        .eq('room_id', roomId);

      if (error) throw error;
    }
    return;
  }

  // Local fallback
  const queue = getLocalQueue(roomId);
  const item = queue.find((i) => i.id === queueItemId);
  if (item) {
    item.position = newPosition;
    item.updated_at = new Date().toISOString();
    queue.sort((a, b) => a.position - b.position);
    setLocalQueue(roomId, queue);
  }
}

/**
 * Immediately switches playback to a specific queued track ("Play Now / Play Immediately").
 */
export async function playTrackNow(roomId: string, queueItemId: string): Promise<void> {
  if (isSupabaseConfigured) {
    // 1. Try atomic RPC rpc_play_track_now
    try {
      const { data, error } = await supabase.rpc('rpc_play_track_now', {
        p_room_id: roomId,
        p_queue_item_id: queueItemId,
      });
      if (!error && data?.success) {
        return;
      }
      if (error && error.code !== 'PGRST202' && !error.message?.includes('function')) {
        throw error;
      }
    } catch (err: any) {
      if (err?.code !== 'PGRST202' && !err?.message?.includes('function')) {
        throw err;
      }
    }

    // 2. Direct fallback (resilient to 0 rows / PGRST116 by using maybeSingle())
    // 2a. Mark currently playing item as played
    await supabase
      .from('queue_items')
      .update({ status: 'played', updated_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('status', 'playing');

    // 2b. Mark target item as playing
    const { data: item, error: itemErr } = await supabase
      .from('queue_items')
      .update({ status: 'playing', updated_at: new Date().toISOString() })
      .eq('id', queueItemId)
      .select('*, song:songs(*)')
      .maybeSingle();

    if (itemErr) throw itemErr;

    // 2c. Update authoritative playback state
    if (item) {
      const { error: pbErr } = await supabase
        .from('playback_states')
        .upsert({
          room_id: roomId,
          current_queue_item_id: item.id,
          current_song_id: item.song_id,
          is_playing: true,
          position_seconds: 0,
          server_updated_at: new Date().toISOString(),
          playback_version: Date.now(),
          updated_at: new Date().toISOString(),
        });
      if (pbErr) throw pbErr;
    }
    return;
  }

  // Local Storage Fallback
  const queue = getLocalQueue(roomId);
  const currentItem = queue.find((i) => i.status === 'playing');
  if (currentItem) {
    currentItem.status = 'played';
  }

  const targetItem = queue.find((i) => i.id === queueItemId);
  if (targetItem) {
    targetItem.status = 'playing';
    setLocalQueue(roomId, queue);
    setLocalPlayback(roomId, {
      room_id: roomId,
      current_queue_item_id: targetItem.id,
      current_song_id: targetItem.song_id,
      is_playing: true,
      position_seconds: 0,
      server_updated_at: new Date().toISOString(),
      playback_version: Date.now(),
      updated_by: 'host',
      updated_at: new Date().toISOString(),
      current_song: targetItem.song,
    });
  }
}

/**
 * Calculates midpoint fractional position for reordering between adjacent items.
 */
export function calculateFractionalPosition(
  items: QueueItem[],
  targetIndex: number
): number {
  if (items.length === 0) return 1000.0;

  if (targetIndex <= 0) {
    const firstPos = items[0]?.position ?? 1000.0;
    return firstPos > 1.0 ? firstPos / 2 : firstPos - 100.0;
  }

  if (targetIndex >= items.length) {
    const lastPos = items[items.length - 1]?.position ?? 0.0;
    return lastPos + 1000.0;
  }

  const prevPos = items[targetIndex - 1]?.position ?? 0.0;
  const nextPos = items[targetIndex]?.position ?? (prevPos + 1000.0);
  return (prevPos + nextPos) / 2;
}

/**
 * Casts a democratic skip vote for the active queue item.
 */
export async function castSkipVote(
  roomId: string,
  queueItemId: string
): Promise<{ currentVotes: number; votesRequired: number; skipped: boolean }> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('rpc_vote_to_skip', {
      p_room_id: roomId,
      p_queue_item_id: queueItemId,
    });
    if (error) throw error;

    return {
      currentVotes: data.current_votes,
      votesRequired: data.votes_required,
      skipped: data.skipped,
    };
  }

  return { currentVotes: 1, votesRequired: 1, skipped: true };
}

// ----------------------------------------------------------------------------
// Local Storage Helpers
// ----------------------------------------------------------------------------
function getLocalQueue(roomId: string): QueueItem[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_QUEUE_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalQueue(roomId: string, queue: QueueItem[]): void {
  try {
    localStorage.setItem(`${LOCAL_QUEUE_KEY_PREFIX}${roomId}`, JSON.stringify(queue));
  } catch {
    // Ignore
  }
}

function getLocalPlayback(roomId: string): PlaybackState | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_PLAYBACK_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalPlayback(roomId: string, state: PlaybackState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(`${LOCAL_PLAYBACK_KEY_PREFIX}${roomId}`);
    } else {
      localStorage.setItem(`${LOCAL_PLAYBACK_KEY_PREFIX}${roomId}`, JSON.stringify(state));
    }
  } catch {
    // Ignore
  }
}

/**
 * Persists detected YouTube media duration to Supabase and local cache.
 */
export async function updateSongDuration(songId: string, durationSeconds: number): Promise<void> {
  if (!songId || durationSeconds <= 0) return;

  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('songs')
        .update({ duration_seconds: durationSeconds })
        .eq('id', songId);
    } catch (err) {
      console.warn('[updateSongDuration] Supabase update warning:', err);
    }
  }

  // Also update local cache for any stored queue
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LOCAL_QUEUE_KEY_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list: any[] = JSON.parse(raw);
          let changed = false;
          list.forEach((item) => {
            if (item.song?.id === songId && (!item.song.duration_seconds || item.song.duration_seconds === 0)) {
              item.song.duration_seconds = durationSeconds;
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem(key, JSON.stringify(list));
          }
        }
      }
    }
  } catch {
    // Ignore storage issues
  }
}
