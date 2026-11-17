import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/useAuthStore';

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  xOffsetPercent: number; // 10% to 90% across stage
  createdAt: number;
}

export function useFloatingReactions(roomId: string | undefined) {
  const { profile } = useAuthStore();
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  useEffect(() => {
    if (!roomId) return;

    let broadcastChannel: any = null;
    if (isSupabaseConfigured) {
      broadcastChannel = supabase.channel(`reactions_${roomId}`);

      broadcastChannel
        .on('broadcast', { event: 'reaction' }, (payload: any) => {
          const newReaction: FloatingReaction = {
            id: payload.payload.id || crypto.randomUUID(),
            emoji: payload.payload.emoji,
            senderName: payload.payload.senderName || 'Listener',
            xOffsetPercent: payload.payload.xOffsetPercent || 50,
            createdAt: Date.now(),
          };

          setReactions((prev) => [...prev, newReaction]);
        })
        .subscribe();
    }

    return () => {
      if (broadcastChannel) {
        supabase.removeChannel(broadcastChannel);
      }
    };
  }, [roomId]);

  // Clean up expired reactions older than 2.2 seconds
  useEffect(() => {
    if (reactions.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setReactions((prev) => prev.filter((r) => now - r.createdAt < 2200));
    }, 500);

    return () => clearInterval(timer);
  }, [reactions.length]);

  const sendReaction = useCallback(
    async (emoji: string) => {
      if (!roomId) return;

      const randomX = Math.floor(Math.random() * 70) + 15; // 15% to 85%
      const newReaction: FloatingReaction = {
        id: crypto.randomUUID(),
        emoji,
        senderName: profile?.display_name || 'You',
        xOffsetPercent: randomX,
        createdAt: Date.now(),
      };

      // Local display
      setReactions((prev) => [...prev, newReaction]);

      // Broadcast to room
      if (isSupabaseConfigured) {
        const channel = supabase.channel(`reactions_${roomId}`);
        await channel.send({
          type: 'broadcast',
          event: 'reaction',
          payload: newReaction,
        });
      }
    },
    [roomId, profile?.display_name]
  );

  return {
    reactions,
    sendReaction,
  };
}
