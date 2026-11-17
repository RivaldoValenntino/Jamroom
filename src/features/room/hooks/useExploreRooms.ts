import { useQuery } from '@tanstack/react-query';
import { getPublicRooms, ActiveRoomSummary } from '../services/roomService';

export function useExploreRooms(searchQuery?: string, categorySlug?: string) {
  return useQuery<ActiveRoomSummary[]>({
    queryKey: ['explore-rooms', searchQuery, categorySlug],
    queryFn: () => getPublicRooms(searchQuery, categorySlug),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
