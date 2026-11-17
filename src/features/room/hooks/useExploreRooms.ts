import { useQuery } from '@tanstack/react-query';
import { getPublicRooms } from '../services/roomService';
import type { Room } from '@/types/database.types';

export function useExploreRooms(searchQuery?: string) {
  return useQuery<Room[]>({
    queryKey: ['explore-rooms', searchQuery],
    queryFn: () => getPublicRooms(searchQuery),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
