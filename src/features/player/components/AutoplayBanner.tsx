import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AutoplayBannerProps {
  isVisible: boolean;
  onEnableAudio: () => void;
  className?: string;
}

export function AutoplayBanner({ isVisible, onEnableAudio, className }: AutoplayBannerProps) {
  if (!isVisible) return null;

  return (
    <div
      className={`rounded border border-primary/40 bg-surface/95 backdrop-blur-xs p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md ${
        className || ''
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs text-foreground">
        <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <p className="font-medium text-xs leading-tight">
          Browser Autoplay Blocked:{' '}
          <span className="text-muted-foreground font-normal">
            Interact to enable sound and synchronize with listeners.
          </span>
        </p>
      </div>

      <Button
        size="sm"
        variant="default"
        onClick={onEnableAudio}
        className="h-7 px-3 text-xs gap-1.5 shrink-0 font-semibold uppercase tracking-wider"
      >
        <Volume2 className="h-3.5 w-3.5" />
        <span>Join Listening</span>
      </Button>
    </div>
  );
}
