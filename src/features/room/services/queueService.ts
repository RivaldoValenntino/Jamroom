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
 * Removes an item from the queue.
 */
export async function removeQueueItem(roomId: string, queueItemId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('queue_items').delete().eq('id', queueItemId);
    if (error) throw error;
    return;
  }

  const queue = getLocalQueue(roomId).filter((i) => i.id !== queueItemId);
  setLocalQueue(roomId, queue);
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
    const { error } = await supabase.rpc('rpc_reorder_queue', {
      p_room_id: roomId,
      p_queue_item_id: queueItemId,
      p_new_position: newPosition,
    });
    if (error) throw error;
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
 * Calculates midpoint fractional position for reordering between adjacent items.
 */
export function calculateFractionalPosition(
  items: QueueItem[],
  targetIndex: number
): number {
  if (items.length === 0) return 1000.0;

  if (targetIndex <= 0) {
    // Insert at very top: half of first item's position
    return items[0].position / 2;
  }

  if (targetIndex >= items.length) {
    // Insert at very bottom: last item + 1000.0
    return items[items.length - 1].position + 1000.0;
  }

  // Insert between targetIndex - 1 and targetIndex
  const prevPos = items[targetIndex - 1].position;
  const nextPos = items[targetIndex].position;
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
