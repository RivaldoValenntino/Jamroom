import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlaybackState, Song } from '@/types/database.types';
import type { YouTubePlayerRef } from '../components/YouTubePlayer';

// Calibrated sync tolerances (prevents buffer starvation and micro-skips)
const DRIFT_IN_SYNC_TOLERANCE = 2.0;       // < 2.0s: fully in-sync, ZERO seeks
const DRIFT_HARD_SEEK_THRESHOLD = 3.5;     // > 3.5s: macro-desync (tab switch, laptop closed)
const SEEK_COOLDOWN_MS = 8000;             // Minimum 8s between hard seeks to stabilize buffer
const NEAR_END_SUPPRESSION_SECONDS = 5.0;  // Don't seek in last 5 seconds

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
  const rateAdjustedRef = useRef<boolean>(false);

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

    if (drift <= DRIFT_IN_SYNC_TOLERANCE) {
      // Tier 1: In Sync (< 2.0s) -> Zero audio interruption
      setSyncState('in_sync');
      if (rateAdjustedRef.current) {
        player.setPlaybackRate(1);
        rateAdjustedRef.current = false;
      }
    } else if (drift <= DRIFT_HARD_SEEK_THRESHOLD && !isNearEnd) {
      // Tier 2: Micro-Drift (2.0s - 3.5s) -> Nudge playback rate gently without cutting audio buffer!
      setSyncState('drift_correcting');
      if (!rateAdjustedRef.current) {
        const subtleRate = localTime < expectedPos ? 1.05 : 0.95;
        player.setPlaybackRate(subtleRate);
        rateAdjustedRef.current = true;
      }
    } else if (!isNearEnd) {
      // Tier 3: Macro-Drift (> 3.5s) -> Hard seek only when substantially desynchronized
      const now = Date.now();
      if (now - lastSeekTimeRef.current >= SEEK_COOLDOWN_MS) {
        setSyncState('drift_correcting');
        player.seekTo(expectedPos);
        lastSeekTimeRef.current = now;

        if (rateAdjustedRef.current) {
          player.setPlaybackRate(1);
          rateAdjustedRef.current = false;
        }

        // Ensure playback state matches authoritative command
        if (playbackState.is_playing) {
          player.play();
        } else {
          player.pause();
        }
      }
    }
  }, [playerRef, playbackState, currentSong, effectiveDuration, calculateExpectedPosition, onTrackEnded]);

  // Synchronize player ONLY when a NEW authoritative command version arrives
  useEffect(() => {
    if (!playbackState || !playerRef.current) return;

    // Reject stale or duplicate versions (avoids stutter on polling refreshes!)
    const isNewVersion = playbackState.playback_version > lastKnownVersionRef.current;
    if (!isNewVersion) {
      return;
    }

    lastKnownVersionRef.current = playbackState.playback_version;
    isAdvancingRef.current = false;

    const expectedPos = calculateExpectedPosition();
    setEstimatedCurrentTime(expectedPos);

    const player = playerRef.current;
    if (playbackState.is_playing) {
      player.play();
      // Only snap if drift is substantial on new command
      const localTime = player.getCurrentTime();
      if (Math.abs(localTime - expectedPos) > DRIFT_HARD_SEEK_THRESHOLD) {
        player.seekTo(expectedPos);
        lastSeekTimeRef.current = Date.now();
      }
    } else {
      player.pause();
      player.seekTo(expectedPos);
    }

    setSyncState(playbackState.is_playing ? 'in_sync' : 'idle');
  }, [playbackState, playerRef, calculateExpectedPosition]);

  // Periodic drift check interval (every 4 seconds, gentle check)
  useEffect(() => {
    if (!playbackState?.is_playing) return;

    const interval = setInterval(evaluateAndCorrectDrift, 4000);
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
      // Prefer reading actual local player time if available
      const localCurrentTime = playerRef.current?.getCurrentTime?.();
      if (localCurrentTime && localCurrentTime > 0) {
        setEstimatedCurrentTime(localCurrentTime);
      } else {
        setEstimatedCurrentTime((prev) => {
          const next = prev + 1;
          return effectiveDuration > 0 ? Math.min(next, effectiveDuration) : next;
        });
      }
    }, 500);

    return () => clearInterval(ticker);
  }, [playbackState?.is_playing, currentSong, effectiveDuration, playerRef]);

  return {
    syncState,
    estimatedCurrentTime,
    evaluateAndCorrectDrift,
  };
}
