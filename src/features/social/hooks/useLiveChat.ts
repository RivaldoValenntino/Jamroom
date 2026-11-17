import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { Message } from '@/types/database.types';
import { fetchRoomMessages, sendRoomMessage, deleteRoomMessage } from '../services/chatService';

export function useLiveChat(roomId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await fetchRoomMessages(roomId, 60);
      setMessages(data);
      setTimeout(scrollToBottom, 100);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, [roomId, scrollToBottom]);

  useEffect(() => {
    if (!roomId) return;
    loadMessages();

    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`chat_${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          async (payload) => {
            // Fetch profile for newly inserted message
            const { data } = await supabase
              .from('messages')
              .select('*, profile:profiles(*)')
              .eq('id', payload.new.id)
              .maybeSingle();

            if (data) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === data.id)) return prev;
                return [...prev, data as Message];
              });
              setTimeout(scrollToBottom, 50);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        )
        .subscribe();
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomId, loadMessages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    if (!roomId) return;
    const msg = await sendRoomMessage(roomId, content);
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setTimeout(scrollToBottom, 50);
  };

  const deleteMessage = async (messageId: string) => {
    await deleteRoomMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  return {
    messages,
    isLoading,
    messagesEndRef,
    sendMessage,
    deleteMessage,
    reload: loadMessages,
  };
}
