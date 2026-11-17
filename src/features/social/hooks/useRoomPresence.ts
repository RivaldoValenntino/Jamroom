import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { touchMemberActivity } from '@/features/room/services/roomService';
import type { RoomRole } from '@/types/database.types';

export interface PresenceMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: RoomRole;
  is_listening: boolean;
  joined_at: string;
}

interface UseRoomPresenceProps {
  roomId: string | undefined;
  userRole: RoomRole;
  isPlaying: boolean;
  onMemberKicked?: (kickedUserId: string) => void;
  onKickedSelf?: () => void;
}

export function useRoomPresence({
  roomId,
  userRole,
  isPlaying,
  onMemberKicked,
  onKickedSelf,
}: UseRoomPresenceProps) {
  const { user, profile } = useAuthStore();
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!roomId || !user) return;

    // 1. Send periodic 30-second heartbeat to database for skip vote active member count
    touchMemberActivity(roomId);
    const heartbeatInterval = setInterval(() => {
      touchMemberActivity(roomId);
    }, 30000);

    // 2. Supabase Realtime Presence channel
    let presenceChannel: any = null;
    if (isSupabaseConfigured) {
      presenceChannel = supabase.channel(`presence_${roomId}`, {
        config: {
          presence: {
            key: user.id,
          },
        },
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const membersList: PresenceMember[] = [];

          for (const key of Object.keys(state)) {
            const presences = state[key] as any[];
            if (presences && presences.length > 0) {
              const latest = presences[presences.length - 1];
              membersList.push({
                user_id: latest.user_id || key,
                display_name: latest.display_name || 'Guest Listener',
                avatar_url: latest.avatar_url || null,
                role: latest.role || 'member',
                is_listening: latest.is_listening ?? true,
                joined_at: latest.joined_at || new Date().toISOString(),
              });
            }
          }
          setOnlineMembers(membersList);
        })
        .on('broadcast', { event: 'member_kicked' }, (payload: any) => {
          const kickedId = payload?.payload?.userId;
          if (kickedId === user.id) {
            if (onKickedSelf) {
              onKickedSelf();
            } else {
              alert('You have been removed from this lounge by the host.');
              window.location.href = '/';
            }
          } else if (kickedId) {
            setOnlineMembers((prev) => prev.filter((m) => m.user_id !== kickedId));
            if (onMemberKicked) {
              onMemberKicked(kickedId);
            }
          }
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await presenceChannel.track({
              user_id: user.id,
              display_name: profile?.display_name || 'Guest',
              avatar_url: profile?.avatar_url || null,
              role: userRole,
              is_listening: isPlaying,
              joined_at: new Date().toISOString(),
            });
          }
        });
    }

    return () => {
      clearInterval(heartbeatInterval);
      if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
      }
    };
  }, [roomId, user?.id, profile?.display_name, profile?.avatar_url, userRole, onMemberKicked, onKickedSelf]);

  // Update listening status in presence when playback toggles
  useEffect(() => {
    if (!roomId || !user || !isSupabaseConfigured) return;

    const channel = supabase.getChannels().find((c) => c.topic === `realtime:presence_${roomId}`);
    if (channel) {
      channel.track({
        user_id: user.id,
        display_name: profile?.display_name || 'Guest',
        avatar_url: profile?.avatar_url || null,
        role: userRole,
        is_listening: isPlaying,
        joined_at: new Date().toISOString(),
      });
    }
  }, [isPlaying, roomId, user?.id, profile?.display_name, profile?.avatar_url, userRole]);

  return {
    onlineMembers,
    onlineCount: onlineMembers.length > 0 ? onlineMembers.length : 1,
  };
}
