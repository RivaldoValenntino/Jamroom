import type { FloatingReaction } from '../hooks/useFloatingReactions';

interface FloatingReactionsProps {
  reactions: FloatingReaction[];
  onSendReaction?: (emoji: string) => void;
  className?: string;
}

export function FloatingReactions({
  reactions,
  className,
}: FloatingReactionsProps) {
  return (
    <div className={`relative ${className || ''}`}>
      {/* Floating Canvas Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-6 flex flex-col items-center animate-float-fade"
            style={{
              left: `${r.xOffsetPercent}%`,
            }}
          >
            <span className="text-2xl filter drop-shadow-md select-none transform hover:scale-125 transition-transform">
              {r.emoji}
            </span>
            <span className="text-[9px] font-mono text-zinc-300 bg-black/75 px-1 rounded border border-zinc-700/50 mt-0.5">
              {r.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* Floating Quick Reaction Toolbar */}
      {/* <div className="flex items-center gap-1 bg-surface/90 backdrop-blur-xs p-1 rounded-full border border-border shadow-xs">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSendReaction(emoji)}
            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted/80 text-sm active:scale-125 transition-transform"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div> */}
    </div>
  );
}
