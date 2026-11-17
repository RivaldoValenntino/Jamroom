import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { Message, MessageType } from '@/types/database.types';

const LOCAL_CHAT_KEY_PREFIX = 'jamroom_local_chat_';

/**
 * Fetches recent chat messages for a room.
 */
export async function fetchRoomMessages(roomId: string, limit = 50): Promise<Message[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles(*)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('[fetchRoomMessages] error:', error);
      return [];
    }

    return (data || []) as Message[];
  }

  // Local offline fallback
  return getLocalMessages(roomId);
}

/**
 * Sends a message in the room chat.
 */
export async function sendRoomMessage(
  roomId: string,
  content: string,
  type: MessageType = 'user'
): Promise<Message> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message cannot be empty');

  if (isSupabaseConfigured) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error('Authentication required to send chat message');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: user.id,
        content: trimmed,
        type,
      })
      .select('*, profile:profiles(*)')
      .single();

    if (error) throw error;
    return data as Message;
  }

  // Local fallback message
  const localMsg: Message = {
    id: crypto.randomUUID(),
    room_id: roomId,
    user_id: 'local-guest',
    content: trimmed,
    type,
    created_at: new Date().toISOString(),
    profile: {
      id: 'local-guest',
      username: 'you',
      display_name: 'You',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
  };

  const stored = getLocalMessages(roomId);
  stored.push(localMsg);
  setLocalMessages(roomId, stored);

  return localMsg;
}

/**
 * Deletes a chat message (allowed for message author or host/mod).
 */
export async function deleteRoomMessage(messageId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) throw error;
  }
}

// ----------------------------------------------------------------------------
// Local Storage Helpers
// ----------------------------------------------------------------------------
function getLocalMessages(roomId: string): Message[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_CHAT_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalMessages(roomId: string, messages: Message[]): void {
  try {
    localStorage.setItem(
      `${LOCAL_CHAT_KEY_PREFIX}${roomId}`,
      JSON.stringify(messages.slice(-100))
    );
  } catch {
    // Ignore
  }
}
