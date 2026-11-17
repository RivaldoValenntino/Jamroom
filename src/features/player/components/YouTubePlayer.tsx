import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

// Declarations for YouTube IFrame API window globals
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
}

interface YouTubePlayerProps {
  videoId: string | null;
  volume?: number;
  isMuted?: boolean;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onDurationChange?: (duration: number) => void;
  onError?: (errorCode: number) => void;
  className?: string;
}

// Global script loading promise to avoid duplicate <script> tags
let ytScriptPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (ytScriptPromise) return ytScriptPromise;

  ytScriptPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevOnReady) prevOnReady();
      resolve();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.body.appendChild(tag);
  });

  return ytScriptPromise;
}

export const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(
  (
    {
      videoId,
      volume = 80,
      isMuted = false,
      onReady,
      onStateChange,
      onDurationChange,
      onError,
      className,
    },
    ref
  ) => {
    const containerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
    const playerInstance = useRef<any>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    // Expose imperative methods to parent components
    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          if (playerInstance.current?.playVideo) {
            try {
              playerInstance.current.playVideo();
            } catch {
              // Ignore browser policy exceptions
            }
          }
        },
        pause: () => {
          if (playerInstance.current?.pauseVideo) {
            try {
              playerInstance.current.pauseVideo();
            } catch {
              // Ignore
            }
          }
        },
        seekTo: (seconds: number) => {
          if (playerInstance.current?.seekTo) {
            try {
              playerInstance.current.seekTo(seconds, true);
            } catch {
              // Ignore
            }
          }
        },
        setVolume: (val: number) => {
          if (playerInstance.current?.setVolume) {
            try {
              playerInstance.current.setVolume(val);
            } catch {
              // Ignore
            }
          }
        },
        mute: () => {
          if (playerInstance.current?.mute) {
            try {
              playerInstance.current.mute();
            } catch {
              // Ignore
            }
          }
        },
        unMute: () => {
          if (playerInstance.current?.unMute) {
            try {
              playerInstance.current.unMute();
            } catch {
              // Ignore
            }
          }
        },
        isMuted: () => {
          if (playerInstance.current?.isMuted) {
            try {
              return playerInstance.current.isMuted();
            } catch {
              return false;
            }
          }
          return false;
        },
        getCurrentTime: () => {
          if (playerInstance.current?.getCurrentTime) {
            try {
              return playerInstance.current.getCurrentTime() || 0;
            } catch {
              return 0;
            }
          }
          return 0;
        },
        getDuration: () => {
          if (playerInstance.current?.getDuration) {
            try {
              return playerInstance.current.getDuration() || 0;
            } catch {
              return 0;
            }
          }
          return 0;
        },
        getPlayerState: () => {
          if (playerInstance.current?.getPlayerState) {
            try {
              return playerInstance.current.getPlayerState();
            } catch {
              return -1;
            }
          }
          return -1;
        },
        setPlaybackRate: (rate: number) => {
          if (playerInstance.current?.setPlaybackRate) {
            try {
              playerInstance.current.setPlaybackRate(rate);
            } catch {
              // Ignore
            }
          }
        },
        getPlaybackRate: () => {
          if (playerInstance.current?.getPlaybackRate) {
            try {
              return playerInstance.current.getPlaybackRate() || 1;
            } catch {
              return 1;
            }
          }
          return 1;
        },
      }),
      []
    );

    // Initialize player once API is ready
    useEffect(() => {
      let isMounted = true;

      loadYouTubeIframeApi().then(() => {
        if (!isMounted || !document.getElementById(containerId.current)) return;

        // Destroy previous instance if any
        if (playerInstance.current?.destroy) {
          try {
            playerInstance.current.destroy();
          } catch {
            // Ignore
          }
        }

        try {
          playerInstance.current = new window.YT.Player(containerId.current, {
            videoId: videoId || undefined,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              playsinline: 1,
              origin: window.location.origin,
            },
            events: {
              onReady: (event: any) => {
                if (!isMounted) return;
                setIsPlayerReady(true);
                if (isMuted) {
                  event.target.mute();
                } else {
                  event.target.unMute();
                  event.target.setVolume(volume);
                }
                const dur = event.target.getDuration?.();
                if (dur && dur > 0 && onDurationChange) {
                  onDurationChange(Math.round(dur));
                }
                if (onReady) onReady();
              },
              onStateChange: (event: any) => {
                if (!isMounted) return;
                const dur = event.target.getDuration?.();
                if (dur && dur > 0 && onDurationChange) {
                  onDurationChange(Math.round(dur));
                }
                if (onStateChange) onStateChange(event.data);
              },
              onError: (event: any) => {
                if (!isMounted) return;
                if (onError) onError(event.data);
              },
            },
          });
        } catch {
          // Fallback handled gracefully
        }
      });

      return () => {
        isMounted = false;
        if (playerInstance.current?.destroy) {
          try {
            playerInstance.current.destroy();
          } catch {
            // Ignore
          }
        }
      };
    }, []);

    // Respond to videoId changes
    useEffect(() => {
      if (!isPlayerReady || !playerInstance.current) return;

      if (videoId) {
        const currentId = playerInstance.current.getVideoData?.()?.video_id;
        if (currentId !== videoId) {
          try {
            playerInstance.current.cueVideoById(videoId);
          } catch {
            // Ignore
          }
        }
      } else {
        try {
          playerInstance.current.stopVideo();
        } catch {
          // Ignore
        }
      }
    }, [videoId, isPlayerReady]);

    // Respond to volume and mute changes
    useEffect(() => {
      if (!isPlayerReady || !playerInstance.current) return;

      try {
        if (isMuted) {
          playerInstance.current.mute();
        } else {
          playerInstance.current.unMute();
          playerInstance.current.setVolume(volume);
        }
      } catch {
        // Ignore
      }
    }, [volume, isMuted, isPlayerReady]);

    return (
      <div className={`relative w-full h-full overflow-hidden ${className || ''}`}>
        {/* The YouTube iframe container must maintain minimum dimensions (min 200x200px) and never display:none */}
        <div id={containerId.current} className="w-full h-full" />
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
