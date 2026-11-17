import { useQuery } from '@tanstack/react-query';
import { getPublicRooms, ActiveRoomSummary } from '../services/roomService';

export function useExploreRooms(searchQuery?: string) {
  return useQuery<ActiveRoomSummary[]>({
    queryKey: ['explore-rooms', searchQuery],
    queryFn: () => getPublicRooms(searchQuery),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
