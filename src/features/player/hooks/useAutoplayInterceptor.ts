import { useEffect } from 'react';

interface UseAutoplayInterceptorProps {
  onUnlock?: () => void;
  playerRef?: React.RefObject<any>;
}

/**
 * Global User Gesture Interceptor.
 * Captures ANY interaction across the entire window (clicks, taps, keys, drag & drop)
 * to immediately satisfy and unblock the browser's audio autoplay policy.
 */
export function useAutoplayInterceptor({ onUnlock, playerRef }: UseAutoplayInterceptorProps) {
  useEffect(() => {
    let hasUnlocked = false;

    const handleInteraction = () => {
      // 1. Resume Web Audio context if suspended
      try {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      } catch {
        // Ignore audio context exceptions
      }

      // 2. Unmute and prime player if available
      try {
        if (playerRef?.current) {
          playerRef.current.unMute?.();
        }
      } catch {
        // Ignore
      }

      // 3. Trigger unlock callback to hide banner
      if (!hasUnlocked) {
        hasUnlocked = true;
        if (onUnlock) {
          onUnlock();
        }
      }
    };

    // Capture every conceivable user interaction type at document root
    const events = [
      'pointerdown',
      'click',
      'keydown',
      'touchstart',
      'touchend',
      'dragstart',
      'drop',
      'wheel',
    ];

    events.forEach((evt) => {
      window.addEventListener(evt, handleInteraction, { capture: true, passive: true });
    });

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleInteraction, { capture: true });
      });
    };
  }, [onUnlock, playerRef]);
}
