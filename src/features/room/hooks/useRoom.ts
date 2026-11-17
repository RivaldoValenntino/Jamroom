import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  getRoomBySlug,
  joinRoom,
  touchMemberActivity,
  claimRoomOwnership,
} from '../services/roomService';
import type { Room, RoomRole } from '@/types/database.types';

export function useRoom(slug: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<RoomRole>('member');
  const [isPasscodeRequired, setIsPasscodeRequired] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  // Fetch room data
  const {
    data: room,
    isLoading,
    error,
    refetch,
  } = useQuery<Room | null>({
    queryKey: ['room', slug],
    queryFn: () => (slug ? getRoomBySlug(slug) : Promise.resolve(null)),
    enabled: Boolean(slug),
    staleTime: 15_000,
  });

  const isHost = Boolean(user && room && user.id === room.owner_id);

  // Attempt automatic enrollment / passcode check
  useEffect(() => {
    if (!room || !user) return;

    if (isHost) {
      setUserRole('owner');
      setIsPasscodeRequired(false);
      return;
    }

    if (room.privacy === 'password') {
      setIsPasscodeRequired(true);
    } else {
      // Auto join public/unlisted rooms
      joinRoom(room.id)
        .then((res) => {
          setUserRole(res.role);
          setIsPasscodeRequired(false);
        })
        .catch((err) => {
          console.warn('[useRoom] Auto join notice:', err);
        });
    }
  }, [room?.id, room?.privacy, user?.id, isHost]);

  // Periodic heartbeat
  useEffect(() => {
    if (!room || isPasscodeRequired) return;

    const interval = setInterval(() => {
      touchMemberActivity(room.id);
    }, 30_000);

    touchMemberActivity(room.id);

    return () => clearInterval(interval);
  }, [room?.id, isPasscodeRequired]);

  // Submit passcode
  const submitPasscode = useCallback(
    async (passcode: string) => {
      if (!room) return false;
      setPasscodeError(null);
      try {
        const res = await joinRoom(room.id, passcode);
        setUserRole(res.role);
        setIsPasscodeRequired(false);
        return true;
      } catch (err: any) {
        setPasscodeError(err.message || 'Incorrect passcode');
        return false;
      }
    },
    [room]
  );

  // Claim ownership via recovery token
  const claimOwnership = useCallback(
    async (recoveryToken: string) => {
      if (!room) throw new Error('No active room');
      const res = await claimRoomOwnership(room.id, recoveryToken);
      setUserRole('owner');
      queryClient.invalidateQueries({ queryKey: ['room', slug] });
      return res;
    },
    [room, slug, queryClient]
  );

  return {
    room,
    isLoading,
    error,
    isHost,
    userRole,
    isPasscodeRequired,
    passcodeError,
    submitPasscode,
    claimOwnership,
    refetch,
  };
}
