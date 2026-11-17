import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Disc,
  Radio,
  Music,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer, YouTubePlayerRef } from './YouTubePlayer';
import { AutoplayBanner } from './AutoplayBanner';
import { formatDuration } from '../services/youtubeService';
import { usePlaybackSync } from '../hooks/usePlaybackSync';
import { useAutoplayInterceptor } from '../hooks/useAutoplayInterceptor';
import { updateSongDuration } from '@/features/room/services/queueService';
import type { Song, PlaybackState } from '@/types/database.types';

interface NowPlayingStageProps {
  currentSong: Song | null;
  playbackState?: PlaybackState | null;
  isPlaying: boolean;
  positionSeconds: number;
  syncStatus?: 'in_sync' | 'buffering' | 'drift_correcting' | 'idle';
  canControlPlayback: boolean;
  canDeleteSong?: boolean;
  skipVotesCount: number;
  skipVotesRequired: number;
  hasVotedToSkip: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onVoteSkip: () => void;
  onDeleteCurrentSong?: () => void;
  onSeek: (seconds: number) => void;
  onOpenSearch: () => void;
}

export function NowPlayingStage({
  currentSong,
  playbackState,
  isPlaying,
  positionSeconds,
  syncStatus: externalSyncStatus,
  canControlPlayback,
  canDeleteSong,
  skipVotesCount,
  skipVotesRequired,
  hasVotedToSkip,
  onTogglePlay,
  onNextTrack,
  onVoteSkip,
  onDeleteCurrentSong,
  onSeek,
  onOpenSearch,
}: NowPlayingStageProps) {
  const playerRef = useRef<YouTubePlayerRef>(null);

  // Live media duration detection (handles tracks added via oEmbed with duration 0)
  const [liveDuration, setLiveDuration] = useState<number>(currentSong?.duration_seconds || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // Sync or reset liveDuration when song changes
  useEffect(() => {
    setLiveDuration(currentSong?.duration_seconds || 0);
  }, [currentSong?.id, currentSong?.duration_seconds]);

  const handleDurationDetected = useCallback(
    (dur: number) => {
      if (dur > 0) {
        setLiveDuration((prev) => (prev !== dur ? dur : prev));

        // If current song in DB has duration 0, persist real duration back to Supabase
        if (currentSong && (!currentSong.duration_seconds || currentSong.duration_seconds === 0)) {
          updateSongDuration(currentSong.id, dur);
        }
      }
    },
    [currentSong]
  );

  const totalDuration = (liveDuration > 0 ? liveDuration : currentSong?.duration_seconds) || 0;

  // Authoritative Playback Synchronization Engine
  const { syncState: internalSyncState, estimatedCurrentTime } = usePlaybackSync({
    playerRef,
    playbackState: playbackState || null,
    currentSong,
    durationSeconds: totalDuration,
    onTrackEnded: onNextTrack,
  });

  const syncStatus = externalSyncStatus || internalSyncState;

  // Local device audio state
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('jamroom_local_volume');
    return saved ? parseInt(saved, 10) : 80;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('jamroom_local_muted') === 'true';
  });
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [isDraggingScrub, setIsDraggingScrub] = useState(false);
  const [scrubValue, setScrubValue] = useState(positionSeconds);

  // Global user gesture interceptor: unblocks browser autoplay policy on ANY event across the window
  useAutoplayInterceptor({
    onUnlock: () => {
      setNeedsUserInteraction(false);
      setIsMuted(false);
      if (playerRef.current) {
        playerRef.current.unMute();
        playerRef.current.setVolume(volume);
        if (isPlaying) {
          playerRef.current.play();
        }
      }
    },
    playerRef,
  });

  // Synchronize playback position counter smoothly without stutter
  useEffect(() => {
    if (!isDraggingScrub) {
      if (isPlaying && playerRef.current) {
        const localT = playerRef.current.getCurrentTime();
        if (localT > 0) {
          setScrubValue(localT);
          return;
        }
      }
      setScrubValue(estimatedCurrentTime || positionSeconds);
    }
  }, [estimatedCurrentTime, positionSeconds, isDraggingScrub, isPlaying]);

  // Smooth 250ms scrub tick when playing
  useEffect(() => {
    if (!isPlaying || isDraggingScrub) return;
    const tick = setInterval(() => {
      const localT = playerRef.current?.getCurrentTime();
      if (localT && localT > 0) {
        setScrubValue(localT);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [isPlaying, isDraggingScrub]);

  // Periodic polling fallback to detect duration if player loaded without event
  useEffect(() => {
    if (!currentSong) return;
    const interval = setInterval(() => {
      if (playerRef.current) {
        const d = playerRef.current.getDuration();
        if (d > 0 && d !== liveDuration) {
          handleDurationDetected(Math.round(d));
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentSong, liveDuration, handleDurationDetected]);

  // Web MediaSession API integration (OS media widgets, Bluetooth headsets, keyboard media keys)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist_channel || 'JAMROOM Music',
        album: 'JAMROOM Virtual Lounge',
        artwork: currentSong.thumbnail_url
          ? [
              { src: currentSong.thumbnail_url, sizes: '128x128', type: 'image/jpeg' },
              { src: currentSong.thumbnail_url, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      if (totalDuration > 0 && scrubValue >= 0) {
        navigator.mediaSession.setPositionState({
          duration: totalDuration,
          playbackRate: playbackRate,
          position: Math.min(scrubValue, totalDuration),
        });
      }

      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlaying && canControlPlayback) onTogglePlay();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlaying && canControlPlayback) onTogglePlay();
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        const target = Math.max(0, scrubValue - offset);
        if (canControlPlayback) {
          setScrubValue(target);
          onSeek(target);
          playerRef.current?.seekTo(target);
        }
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        const maxLimit = totalDuration > 0 ? totalDuration : scrubValue + offset;
        const target = Math.min(maxLimit, scrubValue + offset);
        if (canControlPlayback) {
          setScrubValue(target);
          onSeek(target);
          playerRef.current?.seekTo(target);
        }
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (canControlPlayback) handleRestart();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (canControlPlayback) onNextTrack();
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && canControlPlayback) {
          const maxLimit = totalDuration > 0 ? totalDuration : details.seekTime;
          const target = Math.min(maxLimit, Math.max(0, details.seekTime));
          setScrubValue(target);
          onSeek(target);
          playerRef.current?.seekTo(target);
        }
      });
    } catch (err) {
      console.warn('[MediaSession] setup warning:', err);
    }
  }, [
    currentSong,
    isPlaying,
    totalDuration,
    scrubValue,
    playbackRate,
    canControlPlayback,
    onTogglePlay,
    onNextTrack,
    onSeek,
  ]);

  // Handle local volume change
  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setIsMuted(false);
    localStorage.setItem('jamroom_local_volume', val.toString());
    localStorage.setItem('jamroom_local_muted', 'false');
    playerRef.current?.setVolume(val);
    playerRef.current?.unMute();
  };

  // Toggle local mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    localStorage.setItem('jamroom_local_muted', nextMuted ? 'true' : 'false');
    if (nextMuted) {
      playerRef.current?.mute();
    } else {
      playerRef.current?.unMute();
      playerRef.current?.setVolume(volume);
    }
  };

  // Unlock audio policy via button
  const handleEnableAudio = () => {
    setNeedsUserInteraction(false);
    setIsMuted(false);
    playerRef.current?.unMute();
    playerRef.current?.setVolume(volume);
    playerRef.current?.play();
  };

  const handlePlayerReady = () => {
    const dur = playerRef.current?.getDuration() || 0;
    if (dur > 0) {
      handleDurationDetected(Math.round(dur));
    }
    if (isPlaying) {
      playerRef.current?.play();
    }
  };

  const handlePlayerStateChange = (state: number) => {
    // 1: PLAYING, 2: PAUSED, 0: ENDED, -1: UNSTARTED
    const dur = playerRef.current?.getDuration() || 0;
    if (dur > 0) {
      handleDurationDetected(Math.round(dur));
    }

    if (state === 0) {
      onNextTrack();
    } else if (state === -1 && isPlaying) {
      setNeedsUserInteraction(true);
    }
  };

  const handlePlayerError = (code: number) => {
    console.warn('[YouTubePlayer] Error code:', code);
    // Code 101/150: Video embedding disallowed. Notify user to skip.
    if (code === 101 || code === 150) {
      alert('The YouTube video owner has disabled embedded playback for this track. Advancing or skipping is recommended.');
    }
  };

  // -10s Rewind
  const handleRewind10 = () => {
    if (!canControlPlayback || !currentSong) return;
    const target = Math.max(0, scrubValue - 10);
    setScrubValue(target);
    onSeek(target);
    playerRef.current?.seekTo(target);
  };

  // +10s Forward
  const handleForward10 = () => {
    if (!canControlPlayback || !currentSong) return;
    const maxLimit = totalDuration > 0 ? totalDuration : scrubValue + 10;
    const target = Math.min(maxLimit, scrubValue + 10);
    setScrubValue(target);
    onSeek(target);
    playerRef.current?.seekTo(target);
  };

  // Restart to 0:00
  const handleRestart = () => {
    if (!canControlPlayback || !currentSong) return;
    setScrubValue(0);
    onSeek(0);
    playerRef.current?.seekTo(0);
  };

  // Cycle playback speed
  const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
  const handleCyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(nextRate);
    playerRef.current?.setPlaybackRate(nextRate);
  };

  return (
    <div className="flex flex-col h-full justify-between p-3 sm:p-4 overflow-y-auto space-y-4">
      {/* Browser Autoplay Notification Banner */}
      <AutoplayBanner
        isVisible={needsUserInteraction}
        onEnableAudio={handleEnableAudio}
      />

      {/* Main Video & Stage Container (16:9 Standard) */}
      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-black flex items-center justify-center shadow-xs">
        {currentSong ? (
          <>
            {/* Embedded YouTube Player (Kept visible for TOS compliance) */}
            <YouTubePlayer
              ref={playerRef}
              videoId={currentSong.youtube_id}
              isPlaying={isPlaying}
              volume={volume}
              isMuted={isMuted}
              onReady={handlePlayerReady}
              onStateChange={handlePlayerStateChange}
              onDurationChange={handleDurationDetected}
              onError={handlePlayerError}
              className="absolute inset-0 w-full h-full"
            />

            {/* Click Interceptor Overlay:
                Blocks native YouTube frame play/pause clicks, keeping authoritative control 100% in Jamroom.
                Clicking video triggers Jamroom's room playback and unblocks browser autoplay. */}
            <div
              className="absolute inset-0 z-10 cursor-pointer select-none"
              title={canControlPlayback ? (isPlaying ? 'Click to pause lounge' : 'Click to play lounge') : 'Jamroom Synchronized Audio'}
              onClick={(e) => {
                e.stopPropagation();
                handleEnableAudio();
                if (canControlPlayback) {
                  onTogglePlay();
                }
              }}
            />

            {/* Sync Status Badge (Top-Left) */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded bg-black/85 px-2.5 py-1 text-[10px] font-mono border border-border backdrop-blur-xs select-none pointer-events-none">
              {syncStatus === 'in_sync' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-400 font-semibold uppercase">IN SYNC</span>
                </>
              ) : syncStatus === 'buffering' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-400 font-semibold uppercase">BUFFERING</span>
                </>
              ) : syncStatus === 'drift_correcting' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-cyan-400 font-semibold uppercase">CALIBRATING</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-zinc-500" />
                  <span className="text-zinc-400 font-semibold uppercase">READY</span>
                </>
              )}
            </div>
          </>
        ) : (
          /* Empty / Idle Room Stage */
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <Radio className="h-10 w-10 text-muted-foreground/50 mb-3 opacity-60" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground mb-1">
              Lounge Ready for Audio
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Queue a track from YouTube. All connected devices will synchronize playback automatically.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={onOpenSearch}
              className="h-8 px-4 text-xs font-semibold gap-1.5"
            >
              <Music className="h-3.5 w-3.5" />
              <span>Queue Music</span>
            </Button>
          </div>
        )}
      </div>

      {/* Track Metadata & Visualizer Bar */}
      {currentSong && (
        <div className="p-3 rounded-lg border border-border bg-surface flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Vinyl disc spin indicator */}
            <div className="h-10 w-10 rounded bg-muted/40 border border-border flex items-center justify-center shrink-0 text-primary">
              <Disc className={`h-6 w-6 ${isPlaying ? 'animate-spin' : ''}`} />
            </div>

            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate" title={currentSong.title}>
                {currentSong.title}
              </h2>
              <p className="text-xs text-muted-foreground truncate font-mono">
                {currentSong.artist_channel || 'YouTube Audio'}
              </p>
            </div>
          </div>

          {/* Solid Equalizer Visualizer Bars (NO GRADIENTS!) */}
          <div className="flex items-end gap-1 h-6 shrink-0 px-2">
            {[40, 75, 100, 60, 85, 30, 90, 50].map((h, i) => (
              <span
                key={i}
                className={`w-1 rounded-xs bg-emerald-500 transition-all duration-300 ${
                  isPlaying ? 'opacity-90 animate-pulse' : 'opacity-25 h-1.5!'
                }`}
                style={{
                  height: isPlaying ? `${h}%` : '4px',
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Authoritative Master Playback Controls */}
      <div className="border border-border rounded-lg bg-surface p-3 sm:p-4 flex flex-col gap-3">
        {/* Scrub Slider */}
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="w-10 text-right font-semibold text-foreground">
            {formatDuration(scrubValue)}
          </span>
          <Slider
            value={[scrubValue]}
            max={totalDuration > 0 ? totalDuration : 100}
            step={1}
            disabled={!canControlPlayback || totalDuration === 0}
            onValueChange={(val) => {
              setIsDraggingScrub(true);
              setScrubValue(val[0]);
            }}
            onValueCommit={(val) => {
              setIsDraggingScrub(false);
              onSeek(val[0]);
              playerRef.current?.seekTo(val[0]);
            }}
            className="flex-1"
          />
          <span className="w-10 text-muted-foreground">
            {totalDuration > 0 ? formatDuration(totalDuration) : '--:--'}
          </span>
        </div>

        {/* Action Controls & Volume */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Controls: Restart, Rewind 10, Play/Pause, Forward 10, Next Track */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Restart Track (0:00) */}
            <Button
              size="sm"
              variant="outline"
              disabled={!canControlPlayback || !currentSong}
              onClick={handleRestart}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              title="Restart Track (0:00)"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>

            {/* Rewind 10s */}
            <Button
              size="sm"
              variant="outline"
              disabled={!canControlPlayback || !currentSong}
              onClick={handleRewind10}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              title="Rewind 10 Seconds (-10s)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            {/* Primary Play / Pause */}
            <Button
              size="sm"
              variant="default"
              disabled={!canControlPlayback || !currentSong}
              onClick={onTogglePlay}
              className="h-9 w-9 p-0 rounded-md shrink-0 shadow-xs"
              title={isPlaying ? 'Pause Lounge Audio' : 'Play Lounge Audio'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>

            {/* Forward 10s */}
            <Button
              size="sm"
              variant="outline"
              disabled={!canControlPlayback || !currentSong}
              onClick={handleForward10}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              title="Forward 10 Seconds (+10s)"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>

            {/* Next Track */}
            <Button
              size="sm"
              variant="outline"
              disabled={!canControlPlayback || !currentSong}
              onClick={onNextTrack}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              title="Next Track"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>

            <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

            {/* Skip Vote Button */}
            <Button
              variant={hasVotedToSkip ? 'default' : 'outline'}
              size="sm"
              disabled={!currentSong}
              onClick={onVoteSkip}
              className={`h-8 gap-1.5 text-xs font-mono px-2.5 ${
                hasVotedToSkip ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
              }`}
              title="Vote to skip current song"
            >
              <Flame className={`h-3.5 w-3.5 ${hasVotedToSkip ? 'text-white' : 'text-amber-400'}`} />
              <span>
                Skip ({skipVotesCount}/{skipVotesRequired})
              </span>
            </Button>

            {/* Direct Delete Track Button (Authoritative) */}
            {canDeleteSong && onDeleteCurrentSong && (
              <Button
                variant="outline"
                size="sm"
                disabled={!currentSong}
                onClick={onDeleteCurrentSong}
                className="h-8 gap-1 text-xs font-mono px-2 text-muted-foreground hover:text-destructive hover:border-destructive/40 shrink-0"
                title="Hapus lagu ini seketika (Otoritas Room)"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}

            {/* Playback Rate / Speed Selector */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCyclePlaybackRate}
              disabled={!currentSong}
              className="h-8 px-2 text-[11px] font-mono text-muted-foreground hover:text-foreground"
              title={`Playback Speed: ${playbackRate}x (Click to cycle)`}
            >
              <span>{playbackRate}x</span>
            </Button>
          </div>

          {/* Local Device Audio Controls */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 w-32 sm:w-36">
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title={isMuted ? 'Unmute Local Sound' : 'Mute Local Sound'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-destructive" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={(val) => handleVolumeChange(val[0])}
                max={100}
                className="flex-1"
              />
              <span className="font-mono text-[10px] text-muted-foreground w-7 text-right">
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.();
                } else {
                  document.exitFullscreen?.();
                }
              }}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Fullscreen Stage"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
