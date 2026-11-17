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
    togglePlay: handleTogglePlay,
    nextTrack: handleNextTrack,
    seek: handleSeek,
    voteSkip: handleVoteSkip,
    refresh,
  };
}
