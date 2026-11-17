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

  return [];
}

export async function importPlaylistToRoom(roomId: string, playlistId: string): Promise<number> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('rpc_import_playlist_to_queue', {
      p_room_id: roomId,
      p_playlist_id: playlistId,
    });
    if (error) throw error;
    return data.imported_count || 0;
  }

  return 0;
}

export async function fetchRoomPlaybackHistory(roomId: string): Promise<PlaybackHistoryItem[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('playback_history')
      .select('*, song:songs(*), played_by_profile:profiles(display_name)')
      .eq('room_id', roomId)
      .order('played_at', { ascending: false })
      .limit(30);

    if (error) {
      console.warn('[fetchRoomPlaybackHistory] error:', error);
      return [];
    }
    return (data || []) as PlaybackHistoryItem[];
  }

  // Local fallback
  try {
    const raw = localStorage.getItem(`${LOCAL_HISTORY_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : [];
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
