import { create } from 'zustand';

interface UiState {
  isCreateRoomOpen: boolean;
  isJoinRoomOpen: boolean;
  targetRoomId: string | null;
  activeMobileTab: 'player' | 'queue' | 'chat' | 'members';
  setCreateRoomOpen: (open: boolean) => void;
  setJoinRoomOpen: (open: boolean, roomId?: string) => void;
  setActiveMobileTab: (tab: 'player' | 'queue' | 'chat' | 'members') => void;
}

export const useUiStore = create<UiState>((set) => ({
  isCreateRoomOpen: false,
  isJoinRoomOpen: false,
  targetRoomId: null,
  activeMobileTab: 'player',
  setCreateRoomOpen: (open) => set({ isCreateRoomOpen: open }),
  setJoinRoomOpen: (open, roomId) =>
    set({ isJoinRoomOpen: open, targetRoomId: roomId || null }),
  setActiveMobileTab: (tab) => set({ activeMobileTab: tab }),
}));
