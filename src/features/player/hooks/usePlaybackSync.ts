import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlaybackState, Song } from '@/types/database.types';
import type { YouTubePlayerRef } from '../components/YouTubePlayer';

const DRIFT_TOLERANCE_SECONDS = 0.75;
const SEEK_COOLDOWN_MS = 3000;
const NEAR_END_SUPPRESSION_SECONDS = 2.0;

export type SyncState = 'in_sync' | 'buffering' | 'drift_correcting' | 'idle';

interface UsePlaybackSyncProps {
  playerRef: React.RefObject<YouTubePlayerRef>;
  playbackState: PlaybackState | null;
  currentSong: Song | null;
  durationSeconds?: number;
  onTrackEnded: () => void;
}

export function usePlaybackSync({
  playerRef,
  playbackState,
  currentSong,
  durationSeconds,
  onTrackEnded,
}: UsePlaybackSyncProps) {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [estimatedCurrentTime, setEstimatedCurrentTime] = useState<number>(0);

  const lastSeekTimeRef = useRef<number>(0);
  const lastKnownVersionRef = useRef<number>(0);
  const isAdvancingRef = useRef<boolean>(false);

  const effectiveDuration = (durationSeconds && durationSeconds > 0)
    ? durationSeconds
    : (currentSong?.duration_seconds || 0);

  // Calculates the authoritative expected playback position
  const calculateExpectedPosition = useCallback((): number => {
    if (!playbackState) return 0;
    if (!playbackState.is_playing) {
      return Number(playbackState.position_seconds);
    }

    const serverUpdatedAtMs = new Date(playbackState.server_updated_at).getTime();
    const elapsedSeconds = Math.max(0, (Date.now() - serverUpdatedAtMs) / 1000);
    const expected = Number(playbackState.position_seconds) + elapsedSeconds;

    const maxDuration = effectiveDuration > 0 ? effectiveDuration : 100000;
    return Math.min(expected, maxDuration);
  }, [playbackState, effectiveDuration]);

  // Evaluates drift between local YouTube player and authoritative server time
  const evaluateAndCorrectDrift = useCallback(() => {
    const player = playerRef.current;
    if (!player || !playbackState || !currentSong) {
      setSyncState('idle');
      return;
    }

    const expectedPos = calculateExpectedPosition();
    setEstimatedCurrentTime(expectedPos);

    // If track has reached its end according to server time, trigger end transition
    if (effectiveDuration > 0 && expectedPos >= effectiveDuration) {
      if (!isAdvancingRef.current) {
        isAdvancingRef.current = true;
        onTrackEnded();
      }
      return;
    }

    const localTime = player.getCurrentTime();
    const drift = Math.abs(localTime - expectedPos);

    // Suppress seek if near the track end to prevent audio buffer thrashing
    const isNearEnd =
      effectiveDuration > 0 &&
      effectiveDuration - expectedPos < NEAR_END_SUPPRESSION_SECONDS;

    if (drift <= DRIFT_TOLERANCE_SECONDS) {
      // Tier 1: In Sync
      setSyncState('in_sync');
    } else if (!isNearEnd) {
      // Tier 2: Actionable Drift (> 0.75s)
      const now = Date.now();
      if (now - lastSeekTimeRef.current >= SEEK_COOLDOWN_MS) {
        setSyncState('drift_correcting');
        player.seekTo(expectedPos);
        lastSeekTimeRef.current = now;

        // Ensure playback state matches authoritative command
        if (playbackState.is_playing) {
          player.play();
        } else {
          player.pause();
        }
      }
    }
  }, [playerRef, playbackState, currentSong, calculateExpectedPosition, onTrackEnded]);

  // Synchronize player when playbackState changes (with monotonic version check)
  useEffect(() => {
    if (!playbackState || !playerRef.current) return;

    // Stale version rejection
    if (playbackState.playback_version < lastKnownVersionRef.current) {
      console.warn(
        `[usePlaybackSync] Dropping stale playback_version v${playbackState.playback_version} (current: v${lastKnownVersionRef.current})`
      );
      return;
    }

    lastKnownVersionRef.current = playbackState.playback_version;
    isAdvancingRef.current = false;

    const expectedPos = calculateExpectedPosition();
    setEstimatedCurrentTime(expectedPos);

    const player = playerRef.current;
    if (playbackState.is_playing) {
      player.play();
      // Snap to expected position if far out of sync on state change
      const localTime = player.getCurrentTime();
      if (Math.abs(localTime - expectedPos) > DRIFT_TOLERANCE_SECONDS) {
        player.seekTo(expectedPos);
        lastSeekTimeRef.current = Date.now();
      }
    } else {
      player.pause();
      player.seekTo(expectedPos);
    }

    setSyncState(playbackState.is_playing ? 'in_sync' : 'idle');
  }, [playbackState, playerRef, calculateExpectedPosition]);

  // Periodic drift check interval (every 2.5 seconds)
  useEffect(() => {
    if (!playbackState?.is_playing) return;

    const interval = setInterval(evaluateAndCorrectDrift, 2500);
    return () => clearInterval(interval);
  }, [playbackState?.is_playing, evaluateAndCorrectDrift]);

  // Background Tab Wake Reconciliation (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateAndCorrectDrift();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [evaluateAndCorrectDrift]);

  // Smooth client-side second ticker for UI scrub bars
  useEffect(() => {
    if (!playbackState?.is_playing || !currentSong) return;

    const ticker = setInterval(() => {
      setEstimatedCurrentTime((prev) => {
        const next = prev + 1;
        return currentSong.duration_seconds > 0
          ? Math.min(next, currentSong.duration_seconds)
          : next;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [playbackState?.is_playing, currentSong]);

  return {
    syncState,
    estimatedCurrentTime,
    evaluateAndCorrectDrift,
  };
}
