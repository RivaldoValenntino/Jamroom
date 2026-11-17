import { useState, useEffect } from 'react';
import {
  FolderHeart,
  ListMusic,
  Plus,
  Play,
  Loader2,
  Check,
  ArrowLeft,
  Trash2,
  Search,
  Music,
  ChevronRight,
  Download,
} from 'lucide-react';
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
  deletePlaylist,
  fetchPlaylistItems,
  addTrackToPlaylist,
  removePlaylistItem,
  saveQueueToPlaylist,
  importPlaylistToRoom,
  Playlist,
  PlaylistItem,
} from '../services/playlistService';
import {
  searchYouTube,
  fetchVideoDetails,
  extractYouTubeId,
  formatDuration,
  YouTubeSearchResult,
} from '@/features/player/services/youtubeService';

interface PlaylistModalProps {
  isOpen: boolean;
  roomId?: string;
  onClose: () => void;
  onImportComplete?: () => void;
  onAddSong?: (song: {
    youtubeId: string;
    title: string;
    artistChannel: string;
    durationSeconds: number;
    thumbnailUrl: string;
  }) => Promise<void> | void;
}

export function PlaylistModal({
  isOpen,
  roomId,
  onClose,
  onImportComplete,
  onAddSong,
}: PlaylistModalProps) {
  // Folder list view state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null);

  // Selected playlist items view state
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [queueingItemId, setQueueingItemId] = useState<string | null>(null);
  const [queuedItemIds, setQueuedItemIds] = useState<Set<string>>(new Set());

  // Search & add track state inside playlist
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [addedTrackIds, setAddedTrackIds] = useState<Set<string>>(new Set());

  // Save current room queue to playlist state
  const [isSavingQueue, setIsSavingQueue] = useState(false);
  const [saveQueueSuccess, setSaveQueueSuccess] = useState(false);

  const loadPlaylists = async () => {
    try {
      const data = await fetchUserPlaylists();
      setPlaylists(data);
    } finally {
      setIsLoading(false);
    }
  };

  const loadItems = async (playlistId: string) => {
    setIsLoadingItems(true);
    try {
      const items = await fetchPlaylistItems(playlistId);
      setPlaylistItems(items);
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPlaylists();
    } else {
      setSelectedPlaylist(null);
      setShowAddTrack(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedPlaylist) {
      loadItems(selectedPlaylist.id);
    }
  }, [selectedPlaylist?.id]);

  // Debounced search for adding songs to playlist
  useEffect(() => {
    if (!showAddTrack) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const directVideoId = extractYouTubeId(trimmed);
    if (directVideoId) {
      const timer = setTimeout(async () => {
        try {
          const details = await fetchVideoDetails(directVideoId);
          setSearchResults([details]);
        } catch {
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 250);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchYouTube(trimmed);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, showAddTrack]);

  // Create playlist folder
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsCreating(true);
    try {
      const created = await createPlaylist(newTitle.trim());
      setNewTitle('');
      await loadPlaylists();
      setSelectedPlaylist(created);
    } finally {
      setIsCreating(false);
    }
  };

  // Delete playlist folder
  const handleDeletePlaylist = async (playlistId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this playlist folder and its tracks?')) return;
    setDeletingPlaylistId(playlistId);
    try {
      await deletePlaylist(playlistId);
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null);
      }
      await loadPlaylists();
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  // Import entire playlist into room queue
  const handleImport = async (playlistId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  // Add individual track to playlist
  const handleAddTrackToPlaylist = async (track: YouTubeSearchResult) => {
    if (!selectedPlaylist) return;
    setAddingTrackId(track.id);
    try {
      const newItem = await addTrackToPlaylist({
        playlistId: selectedPlaylist.id,
        youtubeId: track.id,
        title: track.title,
        artistChannel: track.channelTitle || 'YouTube Audio',
        durationSeconds: track.durationSeconds || 0,
        thumbnailUrl: track.thumbnailUrl || '',
      });

      setPlaylistItems((prev) => [...prev, newItem]);
      setAddedTrackIds((prev) => new Set(prev).add(track.id));
      // Update playlist item count locally
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === selectedPlaylist.id
            ? { ...pl, item_count: (pl.item_count || 0) + 1 }
            : pl
        )
      );
      setTimeout(() => {
        setAddedTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to add track to playlist');
    } finally {
      setAddingTrackId(null);
    }
  };

  // Remove individual track from playlist
  const handleRemoveItem = async (itemId: string) => {
    if (!selectedPlaylist) return;
    setDeletingItemId(itemId);
    try {
      await removePlaylistItem(selectedPlaylist.id, itemId);
      setPlaylistItems((prev) => prev.filter((i) => i.id !== itemId));
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === selectedPlaylist.id
            ? { ...pl, item_count: Math.max(0, (pl.item_count || 1) - 1) }
            : pl
        )
      );
    } finally {
      setDeletingItemId(null);
    }
  };

  // Queue a single track into current active room
  const handleQueueTrack = async (item: PlaylistItem) => {
    if (!onAddSong || !item.song) return;
    setQueueingItemId(item.id);
    try {
      await onAddSong({
        youtubeId: item.song.youtube_id,
        title: item.song.title,
        artistChannel: item.song.artist_channel || 'YouTube Audio',
        durationSeconds: item.song.duration_seconds,
        thumbnailUrl: item.song.thumbnail_url || '',
      });
      setQueuedItemIds((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setQueuedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 2000);
    } finally {
      setQueueingItemId(null);
    }
  };

  // Save current room queue into this playlist
  const handleSaveRoomQueue = async () => {
    if (!roomId || !selectedPlaylist) return;
    setIsSavingQueue(true);
    try {
      await saveQueueToPlaylist(selectedPlaylist.id, roomId);
      setSaveQueueSuccess(true);
      await loadItems(selectedPlaylist.id);
      await loadPlaylists();
      setTimeout(() => setSaveQueueSuccess(false), 2500);
    } finally {
      setIsSavingQueue(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-surface border-border p-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedPlaylist ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlaylist(null);
                    setShowAddTrack(false);
                    loadPlaylists();
                  }}
                  className="p-1 -ml-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  title="Back to playlist folders"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : (
                <FolderHeart className="h-4 w-4 text-primary" />
              )}
              <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                {selectedPlaylist ? selectedPlaylist.name : 'Personal Playlists'}
              </DialogTitle>
              {selectedPlaylist && (
                <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5">
                  {playlistItems.length} tracks
                </Badge>
              )}
            </div>

            {selectedPlaylist && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleDeletePlaylist(selectedPlaylist.id, e)}
                disabled={deletingPlaylistId === selectedPlaylist.id}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
                title="Delete this playlist folder"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {selectedPlaylist
              ? 'Add YouTube tracks, manage collection songs, or queue them to your lounge.'
              : 'Your saved guest collections. Open any playlist folder to add and manage tracks.'}
          </DialogDescription>
        </DialogHeader>

        {/* VIEW 1: Playlist Folders List */}
        {!selectedPlaylist ? (
          <>
            {/* Create New Playlist Form */}
            <form onSubmit={handleCreate} className="p-3 border-b border-border bg-muted/20 flex gap-2">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="New playlist folder name (e.g. Synthwave Favorites)..."
                className="h-8 text-xs bg-muted/40 border-border"
                maxLength={60}
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

            {/* Folders List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[250px]">
              {isLoading ? (
                <div className="flex h-36 items-center justify-center text-xs font-mono text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Loading playlist folders...
                </div>
              ) : playlists.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                  <ListMusic className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-semibold text-foreground">No playlists saved yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                    Create a playlist folder above, then open it to add your favorite songs from YouTube!
                  </p>
                </div>
              ) : (
                playlists.map((pl) => {
                  const isImporting = importingId === pl.id;
                  const isImported = importedId === pl.id;
                  const isDeleting = deletingPlaylistId === pl.id;

                  return (
                    <div
                      key={pl.id}
                      onClick={() => setSelectedPlaylist(pl)}
                      className="p-3 rounded border border-border bg-surface hover:bg-surface-hover flex items-center justify-between text-xs transition-colors cursor-pointer group"
                    >
                      <div className="min-w-0 pr-3 flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <ListMusic className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-foreground truncate text-xs group-hover:text-primary transition-colors">
                              {pl.name}
                            </p>
                            <Badge variant="outline" className="font-mono text-[9px] py-0 px-1 shrink-0">
                              {pl.item_count || 0} tracks
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            Click to open &amp; add songs
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {roomId && (
                          <Button
                            size="sm"
                            variant={isImported ? 'outline' : 'default'}
                            onClick={(e) => handleImport(pl.id, e)}
                            disabled={isImporting || isImported}
                            className="h-7 px-2 text-xs gap-1 font-medium"
                            title="Queue all tracks into lounge"
                          >
                            {isImporting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isImported ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Queued</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                <span>Queue All</span>
                              </>
                            )}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedPlaylist(pl)}
                          className="h-7 px-2 text-xs gap-0.5 text-muted-foreground hover:text-foreground"
                          title="Open playlist folder"
                        >
                          <span>Open</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isDeleting}
                          onClick={(e) => handleDeletePlaylist(pl.id, e)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete folder"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* VIEW 2: Selected Playlist Items Detail View */
          <div className="flex-1 overflow-y-auto flex flex-col min-h-[300px]">
            {/* Playlist Actions Subheader */}
            <div className="p-3 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={showAddTrack ? 'secondary' : 'default'}
                  onClick={() => setShowAddTrack((prev) => !prev)}
                  className="h-7 px-2.5 text-xs gap-1 font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{showAddTrack ? 'Hide Search' : 'Add Track'}</span>
                </Button>

                {roomId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSaveRoomQueue}
                    disabled={isSavingQueue}
                    className="h-7 px-2.5 text-xs gap-1 font-medium"
                    title="Copy all currently queued songs in this lounge into this playlist"
                  >
                    {isSavingQueue ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : saveQueueSuccess ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Queue Saved!</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3" />
                        <span>Save Lounge Queue</span>
                      </>
                    )}
                  </Button>
                )}
              </div>

              {roomId && playlistItems.length > 0 && (
                <Button
                  size="sm"
                  variant={importedId === selectedPlaylist.id ? 'outline' : 'default'}
                  onClick={() => handleImport(selectedPlaylist.id)}
                  disabled={importingId === selectedPlaylist.id || importedId === selectedPlaylist.id}
                  className="h-7 px-2.5 text-xs gap-1 font-semibold"
                >
                  {importingId === selectedPlaylist.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : importedId === selectedPlaylist.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Queued to Lounge</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      <span>Queue All ({playlistItems.length})</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Add Track Drawer / YouTube Search Box */}
            {showAddTrack && (
              <div className="p-3 border-b border-border bg-muted/40 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search song title, artist, or paste YouTube link..."
                    className="pl-8 h-8 text-xs bg-surface border-border"
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                  )}
                </div>

                {/* Search Results */}
                {searchResults.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 divide-y divide-border/40">
                    {searchResults.map((res) => {
                      const isAdding = addingTrackId === res.id;
                      const isAdded = addedTrackIds.has(res.id);

                      return (
                        <div
                          key={res.id}
                          className="pt-1.5 pb-1.5 flex items-center justify-between gap-2 text-xs first:pt-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {res.thumbnailUrl ? (
                              <img
                                src={res.thumbnailUrl}
                                alt=""
                                className="h-8 w-11 rounded object-cover shrink-0 bg-muted"
                              />
                            ) : (
                              <div className="h-8 w-11 rounded bg-muted flex items-center justify-center shrink-0">
                                <Music className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate text-xs">
                                {res.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                <span>{res.channelTitle}</span>
                                <span>•</span>
                                <span>{res.durationSeconds > 0 ? formatDuration(res.durationSeconds) : '--:--'}</span>
                              </div>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant={isAdded ? 'outline' : 'default'}
                            onClick={() => handleAddTrackToPlaylist(res)}
                            disabled={isAdding || isAdded}
                            className="h-6 px-2 text-[11px] gap-1 shrink-0 font-medium"
                          >
                            {isAdding ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isAdded ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                <span>Add</span>
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : searchQuery && !isSearching ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">
                    No tracks found for "{searchQuery}". Try another keyword or direct YouTube URL.
                  </p>
                ) : null}
              </div>
            )}

            {/* Playlist Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {isLoadingItems ? (
                <div className="flex h-36 items-center justify-center text-xs font-mono text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Loading tracks...
                </div>
              ) : playlistItems.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center p-4">
                  <Music className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-semibold text-foreground">This playlist is empty</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                    Click <strong>"Add Track"</strong> above to search YouTube and add songs to this playlist folder.
                  </p>
                </div>
              ) : (
                playlistItems.map((item, index) => {
                  const song = item.song;
                  const isDeleting = deletingItemId === item.id;
                  const isQueueing = queueingItemId === item.id;
                  const isQueued = queuedItemIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center justify-between text-xs transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="font-mono text-[10px] text-muted-foreground w-4 text-center shrink-0">
                          {index + 1}
                        </span>

                        {song?.thumbnail_url ? (
                          <img
                            src={song.thumbnail_url}
                            alt=""
                            className="h-8 w-11 rounded object-cover shrink-0 bg-muted"
                          />
                        ) : (
                          <div className="h-8 w-11 rounded bg-muted flex items-center justify-center shrink-0">
                            <Music className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate text-xs">
                            {song?.title || 'Unknown Title'}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                            <span className="truncate">{song?.artist_channel || 'YouTube Audio'}</span>
                            <span>•</span>
                            <span>
                              {song?.duration_seconds ? formatDuration(song.duration_seconds) : '--:--'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onAddSong && (
                          <Button
                            size="sm"
                            variant={isQueued ? 'outline' : 'ghost'}
                            onClick={() => handleQueueTrack(item)}
                            disabled={isQueueing || isQueued}
                            className="h-6 px-2 text-[11px] gap-1 font-medium"
                            title="Queue this song to lounge"
                          >
                            {isQueueing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isQueued ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Queued</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 text-primary" />
                                <span>Queue</span>
                              </>
                            )}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isDeleting}
                          onClick={() => handleRemoveItem(item.id)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          title="Remove from playlist"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 border-t border-border bg-muted/10 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted-foreground font-mono">
            {selectedPlaylist
              ? `${playlistItems.length} tracks in folder`
              : `${playlists.length} playlist folders`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs px-3">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
