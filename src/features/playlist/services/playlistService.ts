import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { Song } from '@/types/database.types';

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  item_count?: number;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  song?: Song;
}

export interface PlaybackHistoryItem {
  id: string;
  room_id: string;
  song_id: string;
  played_at: string;
  duration_seconds: number;
  song?: Song;
  played_by_profile?: {
    display_name: string;
  };
}

const LOCAL_PLAYLISTS_KEY = 'jamroom_local_playlists';
const LOCAL_HISTORY_KEY_PREFIX = 'jamroom_local_history_';

export async function fetchUserPlaylists(): Promise<Playlist[]> {
  if (isSupabaseConfigured) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('playlists')
      .select('*, items:playlist_items(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[fetchUserPlaylists] error:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      ...p,
      item_count: p.items?.[0]?.count || 0,
    }));
  }

  // Local fallback
  return getLocalPlaylists();
}

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Playlist name cannot be empty');

  if (isSupabaseConfigured) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required');

    const { data, error } = await supabase
      .from('playlists')
      .insert({
        user_id: user.id,
        name: trimmed,
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Playlist;
  }

  // Local fallback
  const localList = getLocalPlaylists();
  const newPl: Playlist = {
    id: crypto.randomUUID(),
    user_id: 'local-guest',
    name: trimmed,
    description: description?.trim() || null,
    is_public: false,
    created_at: new Date().toISOString(),
    item_count: 0,
  };
  localList.unshift(newPl);
  localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(localList));
  return newPl;
}

export async function fetchPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('playlist_items')
      .select('*, song:songs(*)')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });

    if (error) {
      console.warn('[fetchPlaylistItems] error:', error);
      return [];
    }
    return (data || []) as PlaylistItem[];
  }

  return getLocalPlaylistItems(playlistId);
}

export interface AddTrackToPlaylistInput {
  playlistId: string;
  youtubeId: string;
  title: string;
  artistChannel: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

export async function addTrackToPlaylist(input: AddTrackToPlaylistInput): Promise<PlaylistItem> {
  if (isSupabaseConfigured) {
    try {
      // 1. Try atomic RPC
      const { data, error } = await supabase.rpc('rpc_add_playlist_item', {
        p_playlist_id: input.playlistId,
        p_youtube_id: input.youtubeId,
        p_title: input.title,
        p_artist_channel: input.artistChannel,
        p_duration_seconds: input.durationSeconds,
        p_thumbnail_url: input.thumbnailUrl,
      });

      if (!error && data) {
        return data as PlaylistItem;
      }

      // 2. Direct fallback if RPC is not deployed yet
      const { data: songData, error: songErr } = await supabase
        .from('songs')
        .upsert(
          {
            youtube_id: input.youtubeId,
            title: input.title,
            artist_channel: input.artistChannel,
            duration_seconds: input.durationSeconds,
            thumbnail_url: input.thumbnailUrl,
          },
          { onConflict: 'youtube_id' }
        )
        .select()
        .single();

      if (songErr) throw songErr;

      // Get current max position
      const { data: lastItem } = await supabase
        .from('playlist_items')
        .select('position')
        .eq('playlist_id', input.playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (lastItem?.position || 0) + 1;

      const { data: itemData, error: itemErr } = await supabase
        .from('playlist_items')
        .insert({
          playlist_id: input.playlistId,
          song_id: songData.id,
          position: nextPos,
        })
        .select('*, song:songs(*)')
        .single();

      if (itemErr) throw itemErr;
      return itemData as PlaylistItem;
    } catch (err) {
      console.warn('[addTrackToPlaylist] Supabase add warning, falling back to local storage:', err);
    }
  }

  // Local fallback
  return addLocalPlaylistItem(input);
}

export async function removePlaylistItem(playlistId: string, itemId: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const { error: rpcErr } = await supabase.rpc('rpc_remove_playlist_item', {
        p_playlist_id: playlistId,
        p_playlist_item_id: itemId,
      });
      if (!rpcErr) return;
    } catch {}

    const { error } = await supabase
      .from('playlist_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    return;
  }

  removeLocalPlaylistItem(playlistId, itemId);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('playlists')
      .delete()
      .eq('id', playlistId);

    if (error) throw error;
    return;
  }

  deleteLocalPlaylist(playlistId);
}

export async function saveQueueToPlaylist(playlistId: string, roomId: string): Promise<number> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('rpc_save_queue_to_playlist', {
        p_playlist_id: playlistId,
        p_room_id: roomId,
      });
      if (!error && data) {
        return data.added_count || 0;
      }
    } catch (err) {
      console.warn('[saveQueueToPlaylist] Supabase warning:', err);
    }
  }
  return 0;
}

export async function importPlaylistToRoom(roomId: string, playlistId: string): Promise<number> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('rpc_import_playlist_to_queue', {
      p_room_id: roomId,
      p_playlist_id: playlistId,
    });
    if (!error && data) return data.imported_count || 0;
  }

  // Local offline queue import
  const items = getLocalPlaylistItems(playlistId);
  if (items.length > 0) {
    const localQueueRaw = localStorage.getItem(`jamroom_local_queue_${roomId}`);
    const localQueue = localQueueRaw ? JSON.parse(localQueueRaw) : [];
    let pos = localQueue.length * 1000;
    for (const item of items) {
      pos += 1000;
      localQueue.push({
        id: crypto.randomUUID(),
        room_id: roomId,
        song_id: item.song_id,
        added_by: 'local-guest',
        position: pos,
        status: localQueue.length === 0 ? 'playing' : 'queued',
        song: item.song,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    localStorage.setItem(`jamroom_local_queue_${roomId}`, JSON.stringify(localQueue));
    return items.length;
  }

  return 0;
}

export async function recordPlaybackHistory(
  roomId: string,
  songId: string,
  durationSeconds: number,
  song?: Song
): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Deduplicate consecutive entry for same track in room within 30s
      const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: recent } = await supabase
        .from('playback_history')
        .select('id')
        .eq('room_id', roomId)
        .eq('song_id', songId)
        .gte('played_at', thirtySecsAgo)
        .limit(1);

      if (!recent || recent.length === 0) {
        await supabase.from('playback_history').insert({
          room_id: roomId,
          song_id: songId,
          played_by: user?.id || null,
          played_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        });
      }
    } catch (err) {
      console.warn('[recordPlaybackHistory] error:', err);
    }
  }

  // Also maintain in local storage
  try {
    const key = `${LOCAL_HISTORY_KEY_PREFIX}${roomId}`;
    const raw = localStorage.getItem(key);
    const existing: PlaybackHistoryItem[] = raw ? JSON.parse(raw) : [];
    const isDup = existing.some(
      (e) => e.song_id === songId && Date.now() - new Date(e.played_at).getTime() < 30000
    );
    if (!isDup) {
      existing.unshift({
        id: crypto.randomUUID(),
        room_id: roomId,
        song_id: songId,
        played_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        song,
      });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
    }
  } catch {
    // Ignore
  }
}

export async function fetchRoomPlaybackHistory(roomId: string): Promise<PlaybackHistoryItem[]> {
  const historyList: PlaybackHistoryItem[] = [];
  const seenSongIds = new Set<string>();

  if (isSupabaseConfigured) {
    try {
      // 1. Fetch from authoritative playback_history table
      let { data, error } = await supabase
        .from('playback_history')
        .select('*, song:songs(*), played_by_profile:profiles(display_name)')
        .eq('room_id', roomId)
        .order('played_at', { ascending: false })
        .limit(50);

      // Fallback if profiles FK relationship alias has issue
      if (error) {
        const fallbackRes = await supabase
          .from('playback_history')
          .select('*, song:songs(*)')
          .eq('room_id', roomId)
          .order('played_at', { ascending: false })
          .limit(50);
        data = fallbackRes.data;
      }

      if (data && data.length > 0) {
        for (const item of data as PlaybackHistoryItem[]) {
          if (item.song) {
            historyList.push(item);
            seenSongIds.add(item.song_id);
          }
        }
      }

      // 2. Augment with tracks currently 'playing' or 'played' in queue_items
      // Ensures that any song that has ever started playing appears in history immediately
      const { data: queueItems } = await supabase
        .from('queue_items')
        .select('id, room_id, song_id, updated_at, song:songs(*)')
        .eq('room_id', roomId)
        .in('status', ['playing', 'played'])
        .order('updated_at', { ascending: false });

      if (queueItems && queueItems.length > 0) {
        for (const qi of queueItems as any[]) {
          if (qi.song && !seenSongIds.has(qi.song_id)) {
            historyList.push({
              id: qi.id,
              room_id: qi.room_id,
              song_id: qi.song_id,
              played_at: qi.updated_at || new Date().toISOString(),
              duration_seconds: qi.song.duration_seconds || 0,
              song: qi.song,
            });
            seenSongIds.add(qi.song_id);
          }
        }
      }

      if (historyList.length > 0) {
        historyList.sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
        return historyList;
      }
    } catch (err) {
      console.warn('[fetchRoomPlaybackHistory] Supabase fetch error:', err);
    }
  }

  // 3. Local Storage Fallback
  try {
    const raw = localStorage.getItem(`${LOCAL_HISTORY_KEY_PREFIX}${roomId}`);
    const localItems: PlaybackHistoryItem[] = raw ? JSON.parse(raw) : [];

    // Also check local queue for playing/played items
    const localQueueRaw = localStorage.getItem(`jamroom_local_queue_${roomId}`);
    const localQueue = localQueueRaw ? JSON.parse(localQueueRaw) : [];
    for (const qi of localQueue) {
      if ((qi.status === 'playing' || qi.status === 'played') && qi.song) {
        if (!localItems.some((li) => li.song_id === qi.song_id)) {
          localItems.unshift({
            id: qi.id,
            room_id: roomId,
            song_id: qi.song_id,
            played_at: qi.updated_at || new Date().toISOString(),
            duration_seconds: qi.song.duration_seconds || 0,
            song: qi.song,
          });
        }
      }
    }

    return localItems;
  } catch {
    return [];
  }
}

function getLocalPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLAYLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const LOCAL_ITEMS_KEY_PREFIX = 'jamroom_local_playlist_items_';

function getLocalPlaylistItems(playlistId: string): PlaylistItem[] {
  try {
    const stored = localStorage.getItem(`${LOCAL_ITEMS_KEY_PREFIX}${playlistId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addLocalPlaylistItem(input: AddTrackToPlaylistInput): PlaylistItem {
  const items = getLocalPlaylistItems(input.playlistId);
  const song: Song = {
    id: crypto.randomUUID(),
    youtube_id: input.youtubeId,
    title: input.title,
    artist_channel: input.artistChannel,
    duration_seconds: input.durationSeconds,
    thumbnail_url: input.thumbnailUrl,
    raw_metadata: {},
    created_at: new Date().toISOString(),
  };

  const newItem: PlaylistItem = {
    id: crypto.randomUUID(),
    playlist_id: input.playlistId,
    song_id: song.id,
    position: items.length + 1,
    song,
  };

  items.push(newItem);
  localStorage.setItem(`${LOCAL_ITEMS_KEY_PREFIX}${input.playlistId}`, JSON.stringify(items));

  // Update item count on local playlist
  const pls = getLocalPlaylists();
  const pl = pls.find((p) => p.id === input.playlistId);
  if (pl) {
    pl.item_count = items.length;
    localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(pls));
  }

  return newItem;
}

function removeLocalPlaylistItem(playlistId: string, itemId: string): void {
  const items = getLocalPlaylistItems(playlistId).filter((i) => i.id !== itemId);
  localStorage.setItem(`${LOCAL_ITEMS_KEY_PREFIX}${playlistId}`, JSON.stringify(items));

  const pls = getLocalPlaylists();
  const pl = pls.find((p) => p.id === playlistId);
  if (pl) {
    pl.item_count = items.length;
    localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(pls));
  }
}

function deleteLocalPlaylist(playlistId: string): void {
  const pls = getLocalPlaylists().filter((p) => p.id !== playlistId);
  localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(pls));
  localStorage.removeItem(`${LOCAL_ITEMS_KEY_PREFIX}${playlistId}`);
}
