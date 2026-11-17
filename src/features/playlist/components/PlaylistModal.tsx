import { useState, useEffect } from 'react';
import { ListMusic, Plus, Play, Loader2, FolderHeart, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  fetchUserPlaylists,
  createPlaylist,
  importPlaylistToRoom,
  Playlist,
} from '../services/playlistService';

interface PlaylistModalProps {
  isOpen: boolean;
  roomId?: string;
  onClose: () => void;
  onImportComplete?: () => void;
}

export function PlaylistModal({
  isOpen,
  roomId,
  onClose,
  onImportComplete,
}: PlaylistModalProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);

  const loadPlaylists = async () => {
    try {
      const data = await fetchUserPlaylists();
      setPlaylists(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPlaylists();
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsCreating(true);
    try {
      await createPlaylist(newTitle.trim());
      setNewTitle('');
      await loadPlaylists();
    } finally {
      setIsCreating(false);
    }
  };

  const handleImport = async (playlistId: string) => {
    if (!roomId) return;
    setImportingId(playlistId);
    try {
      await importPlaylistToRoom(roomId, playlistId);
      setImportedId(playlistId);
      setTimeout(() => setImportedId(null), 2500);
      if (onImportComplete) onImportComplete();
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-surface border-border p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="p-4 pb-3 border-b border-border text-left">
          <div className="flex items-center gap-2">
            <FolderHeart className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Personal Playlists
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Your saved guest collections. Import tracks directly into the room queue.
          </DialogDescription>
        </DialogHeader>

        {/* Create New Playlist Form */}
        <form onSubmit={handleCreate} className="p-3 border-b border-border bg-muted/20 flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New playlist name..."
            className="h-8 text-xs bg-muted/40 border-border"
          />
          <Button
            type="submit"
            size="sm"
            variant="default"
            disabled={isCreating || !newTitle.trim()}
            className="h-8 px-3 text-xs gap-1 font-semibold shrink-0"
          >
            {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            <span>Create</span>
          </Button>
        </form>

        {/* Playlists List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[220px]">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-xs font-mono text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              Loading playlists...
            </div>
          ) : playlists.length === 0 ? (
            <div className="h-36 flex flex-col items-center justify-center text-center p-4">
              <ListMusic className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-semibold text-foreground">No playlists saved yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Create a collection above to curate tracks for your listening lounges.
              </p>
            </div>
          ) : (
            playlists.map((pl) => {
              const isImporting = importingId === pl.id;
              const isImported = importedId === pl.id;

              return (
                <div
                  key={pl.id}
                  className="p-2.5 rounded border border-border bg-surface hover:bg-surface-hover flex items-center justify-between text-xs transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-foreground truncate text-xs">{pl.name}</p>
                      <Badge variant="outline" className="font-mono text-[9px] py-0 px-1">
                        {pl.item_count || 0} tracks
                      </Badge>
                    </div>
                    {pl.description && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {pl.description}
                      </p>
                    )}
                  </div>

                  {roomId && (
                    <Button
                      size="sm"
                      variant={isImported ? 'outline' : 'default'}
                      onClick={() => handleImport(pl.id)}
                      disabled={isImporting || isImported}
                      className="h-7 px-2.5 text-xs gap-1 font-medium shrink-0"
                    >
                      {isImporting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isImported ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Imported</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          <span>Queue All</span>
                        </>
                      )}
                    </Button>
                  )}
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
