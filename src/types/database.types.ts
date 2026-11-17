export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RoomPrivacy = 'public' | 'unlisted' | 'password';
export type RoomRole = 'owner' | 'moderator' | 'member';
export type QueueItemStatus = 'queued' | 'playing' | 'played' | 'skipped';
export type MessageType = 'user' | 'system' | 'announcement';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface RoomCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_at?: string;
}

export interface RoomSettings {
  shared_speakers: boolean;
  add_to_queue_permission: 'anyone' | 'host_and_mods_only';
  reorder_queue_permission: 'anyone' | 'host_and_mods_only';
  delete_queue_permission?: 'host_only' | 'host_and_mods_only' | 'anyone';
  vote_skip_enabled: boolean;
  skip_vote_threshold_percent: number;
  max_queue_items_per_user: number;
  chat_enabled: boolean;
  auto_play_on_queue_add: boolean;
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  privacy: RoomPrivacy;
  owner_id: string;
  category_id?: string | null;
  category?: RoomCategory | null;
  status: 'active' | 'archived';
  max_members: number;
  settings: RoomSettings;
  created_at: string;
  updated_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: RoomRole;
  has_valid_passcode: boolean;
  joined_at: string;
  last_active_at: string;
  profile?: Profile;
}

export interface Song {
  id: string;
  youtube_id: string;
  title: string;
  artist_channel: string | null;
  duration_seconds: number;
  thumbnail_url: string | null;
  raw_metadata: Json;
  created_at: string;
}

export interface QueueItem {
  id: string;
  room_id: string;
  song_id: string;
  added_by: string | null;
  position: number;
  status: QueueItemStatus;
  created_at: string;
  updated_at: string;
  song?: Song;
  added_by_profile?: Profile;
}

export interface PlaybackState {
  room_id: string;
  current_queue_item_id: string | null;
  current_song_id: string | null;
  is_playing: boolean;
  position_seconds: number;
  server_updated_at: string;
  playback_version: number;
  updated_by: string | null;
  updated_at: string;
  current_song?: Song;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  type: MessageType;
  created_at: string;
  profile?: Profile;
}

export interface SkipVote {
  id: string;
  room_id: string;
  queue_item_id: string;
  user_id: string;
  created_at: string;
}
