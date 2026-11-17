import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Disc,
  Radio,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer, YouTubePlayerRef } from './YouTubePlayer';
import { AutoplayBanner } from './AutoplayBanner';
import { formatDuration } from '../services/youtubeService';
import { usePlaybackSync } from '../hooks/usePlaybackSync';
import type { Song, PlaybackState } from '@/types/database.types';

interface NowPlayingStageProps {
  currentSong: Song | null;
  playbackState?: PlaybackState | null;
  isPlaying: boolean;
  positionSeconds: number;
  syncStatus?: 'in_sync' | 'buffering' | 'drift_correcting' | 'idle';
  canControlPlayback: boolean;
  skipVotesCount: number;
  skipVotesRequired: number;
  hasVotedToSkip: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onVoteSkip: () => void;
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
  skipVotesCount,
  skipVotesRequired,
  hasVotedToSkip,
  onTogglePlay,
  onNextTrack,
  onVoteSkip,
  onSeek,
  onOpenSearch,
}: NowPlayingStageProps) {
  const playerRef = useRef<YouTubePlayerRef>(null);

  // Authoritative Playback Synchronization Engine
  const { syncState: internalSyncState, estimatedCurrentTime } = usePlaybackSync({
    playerRef,
    playbackState: playbackState || null,
    currentSong,
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

  // Synchronize playback position counter
  useEffect(() => {
    if (!isDraggingScrub) {
      setScrubValue(estimatedCurrentTime || positionSeconds);
    }
  }, [estimatedCurrentTime, positionSeconds, isDraggingScrub]);

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
    if (isPlaying) {
      playerRef.current?.play();
    }
  };

  const handlePlayerStateChange = (state: number) => {
    // 1: PLAYING, 2: PAUSED, -1: UNSTARTED
    if (state === -1 && isPlaying) {
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

  const totalDuration = currentSong?.duration_seconds || 0;

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
              volume={volume}
              isMuted={isMuted}
              onReady={handlePlayerReady}
              onStateChange={handlePlayerStateChange}
              onError={handlePlayerError}
              className="absolute inset-0 w-full h-full"
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
          <span className="w-10 text-right">{formatDuration(scrubValue)}</span>
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
          <span className="w-10">{formatDuration(totalDuration)}</span>
        </div>

        {/* Action Controls & Volume */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Play, Next, Skip Vote */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={!canControlPlayback || !currentSong}
              onClick={onTogglePlay}
              className="h-9 w-9 p-0 rounded-md"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={!canControlPlayback || !currentSong}
              onClick={onNextTrack}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
              title="Next Track"
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            <div className="h-5 w-px bg-border mx-1" />

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
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
