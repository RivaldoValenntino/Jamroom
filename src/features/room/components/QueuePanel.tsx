import { Plus, Disc, Trash2, ArrowUp, ArrowDown, Music, History, FolderHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { QueueItem } from '@/types/database.types';
import { formatDuration } from '@/features/player/services/youtubeService';

interface QueuePanelProps {
  currentQueueItem: QueueItem | null;
  upcomingQueue: QueueItem[];
  canAddSong: boolean;
  canManageQueue: boolean;
  currentUserId: string | null;
  onOpenSearch: () => void;
  onOpenHistory?: () => void;
  onOpenPlaylists?: () => void;
  onRemoveItem: (queueItemId: string) => void;
  onMoveItem?: (queueItemId: string, direction: 'up' | 'down') => void;
  className?: string;
}

export function QueuePanel({
  currentQueueItem,
  upcomingQueue,
  canAddSong,
  canManageQueue,
  currentUserId,
  onOpenSearch,
  onOpenHistory,
  onOpenPlaylists,
  onRemoveItem,
  onMoveItem,
  className,
}: QueuePanelProps) {
  const totalSeconds = upcomingQueue.reduce((acc, item) => {
    return acc + (item.song?.duration_seconds || 0);
  }, 0);

  return (
    <div className={`flex flex-col h-full overflow-hidden bg-surface/30 ${className || ''}`}>
      {/* Queue Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
            Queue ({upcomingQueue.length + (currentQueueItem ? 1 : 0)})
          </span>
          {totalSeconds > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              • {formatDuration(totalSeconds)} upcoming
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onOpenPlaylists && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenPlaylists}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Personal Playlists"
            >
              <FolderHeart className="h-3 w-3" />
            </Button>
          )}

          {onOpenHistory && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onOpenHistory}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Playback History"
            >
              <History className="h-3 w-3" />
            </Button>
          )}

          {canAddSong && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenSearch}
              className="h-6 text-[11px] gap-1 px-2 font-medium text-primary hover:text-primary hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" />
              <span>Add Song</span>
            </Button>
          )}
        </div>
      </div>

      {/* Queue Content List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* NOW PLAYING TRACK */}
        {currentQueueItem && currentQueueItem.song ? (
          <div className="p-2.5 rounded border border-primary/40 bg-primary/10 flex items-center gap-2.5 text-xs">
            <div className="relative h-10 w-16 rounded overflow-hidden bg-black shrink-0 border border-primary/30">
              {currentQueueItem.song.thumbnail_url ? (
                <img
                  src={currentQueueItem.song.thumbnail_url}
                  alt={currentQueueItem.song.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-primary">
                  <Disc className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant="default" className="text-[9px] px-1 py-0 uppercase">
                  NOW PLAYING
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatDuration(currentQueueItem.song.duration_seconds)}
                </span>
              </div>
              <p className="font-semibold text-foreground truncate text-xs" title={currentQueueItem.song.title}>
                {currentQueueItem.song.title}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {currentQueueItem.song.artist_channel || 'YouTube Audio'}
                {currentQueueItem.added_by_profile && ` • Queued by ${currentQueueItem.added_by_profile.display_name}`}
              </p>
            </div>
          </div>
        ) : null}

        {/* UPCOMING TRACKS */}
        {upcomingQueue.length > 0 ? (
          upcomingQueue.map((item, index) => {
            const song = item.song;
            const canDelete =
              canManageQueue || (currentUserId && item.added_by === currentUserId);

            return (
              <div
                key={item.id}
                className="group p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center gap-2 text-xs transition-colors"
              >
                {/* Index position */}
                <span className="w-5 text-center font-mono text-[11px] text-muted-foreground shrink-0">
                  {index + 1}
                </span>

                {/* Track Thumbnail */}
                <div className="relative h-9 w-14 rounded overflow-hidden bg-black shrink-0 border border-border">
                  {song?.thumbnail_url ? (
                    <img
                      src={song.thumbnail_url}
                      alt={song?.title || 'Track'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      <Music className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate text-xs" title={song?.title}>
                    {song?.title || 'Queued Track'}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                    <span>{song?.artist_channel || 'YouTube'}</span>
                    <span>•</span>
                    <span className="font-mono">
                      {formatDuration(song?.duration_seconds || 0)}
                    </span>
                    {item.added_by_profile && (
                      <>
                        <span>•</span>
                        <span className="truncate">{item.added_by_profile.display_name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions: Reorder & Remove */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  {canManageQueue && onMoveItem && (
                    <>
                      {index > 0 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onMoveItem(item.id, 'up')}
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Move Up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                      )}
                      {index < upcomingQueue.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onMoveItem(item.id, 'down')}
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Move Down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}

                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveItem(item.id)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Remove from queue"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        ) : !currentQueueItem ? (
          /* Empty Queue State */
          <div className="h-48 flex flex-col items-center justify-center text-center p-4">
            <Disc className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-foreground">The queue is empty</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5 mb-3">
              Add a track from YouTube to begin synchronized listening with everyone in this lounge.
            </p>
            {canAddSong && (
              <Button
                size="sm"
                variant="default"
                onClick={onOpenSearch}
                className="h-7 px-3 text-xs gap-1 font-semibold"
              >
                <Plus className="h-3 w-3" />
                Add First Song
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Queue Footer */}
      <div className="px-3 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
        <span>Master Queue Authoritative</span>
        <span>Auto-Advance ON</span>
      </div>
    </div>
  );
}
