import { useState, useEffect } from 'react';
import { History, Plus, Loader2, Music, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  fetchRoomPlaybackHistory,
  PlaybackHistoryItem,
} from '../services/playlistService';
import { formatDuration } from '@/features/player/services/youtubeService';

interface RoomHistoryModalProps {
  isOpen: boolean;
  roomId: string;
  onClose: () => void;
  onRequeue: (song: {
    youtubeId: string;
    title: string;
    artistChannel: string;
    durationSeconds: number;
    thumbnailUrl: string;
  }) => Promise<void> | void;
}

export function RoomHistoryModal({
  isOpen,
  roomId,
  onClose,
  onRequeue,
}: RoomHistoryModalProps) {
  const [history, setHistory] = useState<PlaybackHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requeueingId, setRequeueingId] = useState<string | null>(null);
  const [requeuedIds, setRequeuedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchRoomPlaybackHistory(roomId)
        .then(setHistory)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, roomId]);

  const handleRequeue = async (item: PlaybackHistoryItem) => {
    if (!item.song) return;
    setRequeueingId(item.id);
    try {
      await onRequeue({
        youtubeId: item.song.youtube_id,
        title: item.song.title,
        artistChannel: item.song.artist_channel || 'YouTube Audio',
        durationSeconds: item.song.duration_seconds,
        thumbnailUrl: item.song.thumbnail_url || '',
      });
      setRequeuedIds((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setRequeuedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 2500);
    } finally {
      setRequeueingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-surface border-border p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="p-4 pb-3 border-b border-border text-left">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Lounge Playback History
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Songs previously played in this room. Click Re-queue to add any track back to the live queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[250px]">
          {isLoading ? (
            <div className="flex h-36 items-center justify-center text-xs font-mono text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="h-36 flex flex-col items-center justify-center text-center p-4">
              <History className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-semibold text-foreground">No songs played yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Completed tracks will automatically be archived here.
              </p>
            </div>
          ) : (
            history.map((item) => {
              const song = item.song;
              const isRequeued = requeuedIds.has(item.id);
              const isRequeueing = requeueingId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center gap-2.5 text-xs transition-colors"
                >
                  <div className="relative h-9 w-14 rounded overflow-hidden bg-black shrink-0 border border-border">
                    {song?.thumbnail_url ? (
                      <img
                        src={song.thumbnail_url}
                        alt={song.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Music className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-xs" title={song?.title}>
                      {song?.title || 'Unknown Track'}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {song?.artist_channel || 'YouTube'} • {formatDuration(item.duration_seconds)}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={isRequeued ? 'outline' : 'default'}
                    onClick={() => handleRequeue(item)}
                    disabled={isRequeueing || isRequeued}
                    className="h-7 px-2.5 text-xs gap-1 shrink-0 font-medium"
                  >
                    {isRequeueing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isRequeued ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Queued</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        <span>Re-queue</span>
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-border bg-muted/10 text-right">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs px-3">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
