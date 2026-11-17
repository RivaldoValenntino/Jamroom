import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import type { QueueItem, PlaybackState, Song } from '@/types/database.types';
import {
  fetchRoomQueue,
  fetchPlaybackState,
  addTrackToQueue,
  removeQueueItem,
  advanceToNextSong,
  updatePlayback,
  castSkipVote,
  reorderQueueItem,
  calculateFractionalPosition,
  playTrackNow,
  AddTrackPayload,
} from '../services/queueService';

export function useRoomQueue(roomId: string | undefined) {
  const [currentQueueItem, setCurrentQueueItem] = useState<QueueItem | null>(null);
  const [upcomingQueue, setUpcomingQueue] = useState<QueueItem[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [skipVotesCount, setSkipVotesCount] = useState(0);
  const [skipVotesRequired, setSkipVotesRequired] = useState(2);
  const [hasVotedToSkip, setHasVotedToSkip] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'in_sync' | 'buffering' | 'drift_correcting' | 'idle'>('idle');

  const currentSong: Song | null =
    currentQueueItem?.song || playbackState?.current_song || null;

  // Hydrate queue and playback state
  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const [queueData, pb] = await Promise.all([
        fetchRoomQueue(roomId),
        fetchPlaybackState(roomId),
      ]);

      setCurrentQueueItem(queueData.currentItem);
      setUpcomingQueue(queueData.upcoming);
      setPlaybackState(pb);

      if (pb) {
        setIsPlaying(pb.is_playing);
        // Calculate elapsed time from server_updated_at if playing
        if (pb.is_playing && pb.server_updated_at) {
          const deltaSec = (Date.now() - new Date(pb.server_updated_at).getTime()) / 1000;
          setPositionSeconds(Math.max(0, pb.position_seconds + Math.max(0, deltaSec)));
        } else {
          setPositionSeconds(pb.position_seconds);
        }
        setSyncStatus(pb.is_playing ? 'in_sync' : 'idle');
      } else {
        setIsPlaying(false);
        setPositionSeconds(0);
        setSyncStatus('idle');
      }
    } catch {
      // Ignore
    }
  }, [roomId]);

  // Initial load and periodic refresh
  useEffect(() => {
    if (!roomId) return;
    refresh();

    // Polling backup interval
    const interval = setInterval(refresh, 4000);

    // Supabase Realtime CDC subscription for instant updates
    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel(`room_sync_${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'playback_states', filter: `room_id=eq.${roomId}` },
          () => refresh()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
          () => refresh()
        )
        .subscribe();
    }

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomId, refresh]);

  // Actions
  const handleAddSong = async (track: AddTrackPayload) => {
    if (!roomId) return;
    await addTrackToQueue(roomId, track);
    await refresh();
  };

  const handleRemoveSong = async (queueItemId: string) => {
    if (!roomId) return;
    await removeQueueItem(roomId, queueItemId);
    await refresh();
  };

  const handleMoveSong = async (queueItemId: string, direction: 'up' | 'down') => {
    if (!roomId) return;
    const currentIndex = upcomingQueue.findIndex((i) => i.id === queueItemId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= upcomingQueue.length) return;

    const remaining = upcomingQueue.filter((i) => i.id !== queueItemId);
    let newPos: number;

    if (direction === 'up') {
      if (targetIndex === 0) {
        newPos = remaining[0].position / 2;
      } else {
        newPos = (remaining[targetIndex - 1].position + remaining[targetIndex].position) / 2;
      }
    } else {
      if (targetIndex >= remaining.length) {
        newPos = remaining[remaining.length - 1].position + 1000.0;
      } else {
        newPos = (remaining[targetIndex - 1].position + remaining[targetIndex].position) / 2;
      }
    }

    // Optimistic reorder
    const reordered = [...upcomingQueue];
    const [moved] = reordered.splice(currentIndex, 1);
    moved.position = newPos;
    reordered.splice(targetIndex, 0, moved);
    setUpcomingQueue(reordered);

    try {
      await reorderQueueItem(roomId, queueItemId, newPos);
    } catch (err) {
      console.error('[handleReorderToIndex] Reorder error:', err);
      await refresh();
    }
  };

  const handleReorderToIndex = async (queueItemId: string, targetIndex: number) => {
    if (!roomId) return;
    const currentIndex = upcomingQueue.findIndex((i) => i.id === queueItemId);
    if (currentIndex === -1 || currentIndex === targetIndex) return;

    const remaining = upcomingQueue.filter((i) => i.id !== queueItemId);
    const newPos = calculateFractionalPosition(remaining, targetIndex);

    // Optimistic UI reorder
    const reordered = [...upcomingQueue];
    const [moved] = reordered.splice(currentIndex, 1);
    moved.position = newPos;
    reordered.splice(targetIndex, 0, moved);
    setUpcomingQueue(reordered);

    // Automatically ensure room playback is active on reorder
    if (!isPlaying) {
      setIsPlaying(true);
    }

    try {
      await reorderQueueItem(roomId, queueItemId, newPos);
    } catch (err) {
      console.error('[handleReorderToIndex] Reorder error:', err);
      await refresh();
    }
  };

  const handlePlayImmediately = async (queueItemId: string) => {
    if (!roomId) return;
    const target = upcomingQueue.find((i) => i.id === queueItemId);
    if (target) {
      // Optimistic instant play transition - zero UI lag
      setCurrentQueueItem(target);
      setUpcomingQueue(upcomingQueue.filter((i) => i.id !== queueItemId));
      setIsPlaying(true);
      setPositionSeconds(0);
    }
    try {
      await playTrackNow(roomId, queueItemId);
      await refresh();
    } catch (err) {
      console.warn('[handlePlayImmediately] error:', err);
      await refresh();
    }
  };

  const handleTogglePlay = async () => {
    if (!roomId || !playbackState) return;
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    await updatePlayback(
      roomId,
      nextPlaying,
      positionSeconds,
      playbackState.playback_version
    );
    await refresh();
  };

  const handleNextTrack = async () => {
    if (!roomId) return;
    // Optimistic instant track advance
    if (upcomingQueue.length > 0) {
      const next = upcomingQueue[0];
      setCurrentQueueItem(next);
      setUpcomingQueue(upcomingQueue.slice(1));
      setIsPlaying(true);
      setPositionSeconds(0);
    }
    await advanceToNextSong(roomId);
    setHasVotedToSkip(false);
    await refresh();
  };

  const handleSeek = async (seconds: number) => {
    if (!roomId || !playbackState) return;
    setPositionSeconds(seconds);
    await updatePlayback(
      roomId,
      isPlaying,
      seconds,
      playbackState.playback_version
    );
  };

  const handleVoteSkip = async () => {
    if (!roomId || !currentQueueItem) return;
    setHasVotedToSkip(true);
    try {
      const res = await castSkipVote(roomId, currentQueueItem.id);
      setSkipVotesCount(res.currentVotes);
      setSkipVotesRequired(res.votesRequired);
      if (res.skipped) {
        setHasVotedToSkip(false);
        await refresh();
      }
    } catch {
      // Revert if vote failed
      setHasVotedToSkip(false);
    }
  };

  return {
    currentQueueItem,
    currentSong,
    upcomingQueue,
    playbackState,
    isPlaying,
    positionSeconds,
    syncStatus,
    skipVotesCount,
    skipVotesRequired,
    hasVotedToSkip,
    addSong: handleAddSong,
    removeSong: handleRemoveSong,
    moveSong: handleMoveSong,
    reorderToIndex: handleReorderToIndex,
    playImmediately: handlePlayImmediately,
    togglePlay: handleTogglePlay,
    nextTrack: handleNextTrack,
    seek: handleSeek,
    voteSkip: handleVoteSkip,
    refresh,
  };
}
