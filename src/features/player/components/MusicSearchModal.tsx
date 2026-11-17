import { useState, useEffect } from 'react';
import { Search, Link as LinkIcon, Plus, Loader2, Music, AlertCircle, Check, FolderPlus } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  searchYouTube,
  fetchVideoDetails,
  extractYouTubeId,
  YouTubeSearchResult,
} from '../services/youtubeService';
import {
  fetchUserPlaylists,
  addTrackToPlaylist,
  Playlist,
} from '@/features/playlist/services/playlistService';

interface MusicSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: {
    youtubeId: string;
    title: string;
    artistChannel: string;
    durationSeconds: number;
    thumbnailUrl: string;
  }) => Promise<void> | void;
}

export function MusicSearchModal({ isOpen, onClose, onAddSong }: MusicSearchModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'direct'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Playlists cache for bookmarking
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Direct paste state
  const [directInput, setDirectInput] = useState('');
  const [directPreview, setDirectPreview] = useState<YouTubeSearchResult | null>(null);
  const [isValidatingDirect, setIsValidatingDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // Adding track state
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Load playlists whenever modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUserPlaylists().then((pls) => setPlaylists(pls)).catch(() => {});
    }
  }, [isOpen]);

  const handleSaveToPlaylist = async (playlistId: string, item: YouTubeSearchResult) => {
    try {
      await addTrackToPlaylist({
        playlistId,
        youtubeId: item.id,
        title: item.title,
        artistChannel: item.channelTitle || 'YouTube Audio',
        durationSeconds: item.durationSeconds || 0,
        thumbnailUrl: item.thumbnailUrl || '',
      });
      const targetPl = playlists.find((p) => p.id === playlistId);
      setSavedMsg(`Saved to playlist "${targetPl?.name || 'Collection'}"`);
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to save track to playlist');
    }
  };

  // Debounced search effect
  useEffect(() => {
    if (activeTab !== 'search') return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    // Smart link detection: if user pasted a YouTube URL or 11-char ID in search, resolve directly!
    const directVideoId = extractYouTubeId(trimmed);
    if (directVideoId) {
      const timer = setTimeout(async () => {
        try {
          const details = await fetchVideoDetails(directVideoId);
          setResults([details]);
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 250);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(async () => {
      try {
        const searchResults = await searchYouTube(trimmed);
        setResults(searchResults);
      } catch (err: any) {
        if (err.message === 'YOUTUBE_API_NOT_ENABLED') {
          setSearchError('YOUTUBE_API_NOT_ENABLED');
        } else if (err.message === 'YOUTUBE_QUOTA_EXCEEDED') {
          setSearchError('YOUTUBE_QUOTA_EXCEEDED');
        } else {
          setSearchError(err.message || 'Unable to fetch YouTube results. Try direct URL paste.');
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, activeTab]);

  // Direct URL parser effect
  useEffect(() => {
    if (activeTab !== 'direct') return;
    const trimmed = directInput.trim();
    if (!trimmed) {
      setDirectPreview(null);
      setDirectError(null);
      return;
    }

    const videoId = extractYouTubeId(trimmed);
    if (!videoId) {
      setDirectPreview(null);
      setDirectError('Enter a valid YouTube URL (e.g. https://youtu.be/... or 11-char ID)');
      return;
    }

    setDirectError(null);
    setIsValidatingDirect(true);

    const timer = setTimeout(async () => {
      try {
        const details = await fetchVideoDetails(videoId);
        setDirectPreview(details);
      } catch (err: any) {
        setDirectError('Failed to retrieve video details. You can still queue by ID.');
        setDirectPreview({
          id: videoId,
          title: `YouTube Video (${videoId})`,
          channelTitle: 'YouTube',
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          durationSeconds: 0,
          durationFormatted: '--:--',
        });
      } finally {
        setIsValidatingDirect(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [directInput, activeTab]);

  const handleQueueTrack = async (item: YouTubeSearchResult) => {
    setAddingId(item.id);
    try {
      await onAddSong({
        youtubeId: item.id,
        title: item.title,
        artistChannel: item.channelTitle,
        durationSeconds: item.durationSeconds,
        thumbnailUrl: item.thumbnailUrl,
      });
      setAddedIds((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 2500);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-surface border-border p-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b border-border text-left">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Music className="h-4 w-4 text-primary" />
                Add Song to Queue
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Search the YouTube catalog or paste any direct YouTube video URL.
              </DialogDescription>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 mt-3 bg-muted/40 p-0.5 rounded border border-border">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'search'
                  ? 'bg-surface text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search YouTube</span>
            </button>
            <button
              onClick={() => setActiveTab('direct')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'direct'
                  ? 'bg-surface text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              <span>Direct Link / Video ID</span>
            </button>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto min-h-[300px] flex flex-col gap-3">
          {savedMsg && (
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-1.5 animate-in fade-in">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>{savedMsg}</span>
            </div>
          )}

          {activeTab === 'search' ? (
            <>
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search artist, track title, or keyword..."
                  className="pl-9 h-9 text-xs bg-muted/30 border-border"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Error / Quota Notice Banner */}
              {searchError && (
                <div className="p-3 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="flex-1 space-y-1">
                    {searchError === 'YOUTUBE_API_NOT_ENABLED' ? (
                      <>
                        <p className="font-semibold text-foreground">
                          YouTube Data API v3 Belum Diaktifkan di Project GCP
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Error <code className="font-mono bg-black/40 px-1 py-0.2 rounded text-amber-300">PERMISSION_DENIED</code> terjadi karena API belum diaktifkan di Google Cloud Console.
                        </p>
                        <ol className="list-decimal pl-4 text-[10px] text-muted-foreground space-y-0.5 pt-0.5">
                          <li>Buka Google Cloud Console &gt; <strong>APIs &amp; Services &gt; Library</strong>.</li>
                          <li>Cari <strong>YouTube Data API v3</strong> lalu klik tombol <strong>ENABLE</strong>.</li>
                          <li>Jika API key dibatasi (API restrictions), pastikan centang YouTube Data API v3.</li>
                        </ol>
                      </>
                    ) : (
                      <p className="font-medium text-foreground">{searchError}</p>
                    )}
                    <div className="pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveTab('direct')}
                        className="h-6 text-[11px] px-2 text-amber-300 hover:text-white border-amber-500/40"
                      >
                        Gunakan Tab Direct Link (Tanpa API Key) →
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Results List */}
              <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                {results.length > 0 ? (
                  results.map((item) => {
                    const isAdded = addedIds.has(item.id);
                    const isAdding = addingId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center gap-3 transition-colors text-xs"
                      >
                        {/* Thumbnail */}
                        <div className="relative h-12 w-20 rounded overflow-hidden bg-black shrink-0 border border-border">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                              <Music className="h-4 w-4" />
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 bg-black/85 text-[9px] font-mono px-1 py-0.2 rounded text-zinc-300">
                            {item.durationFormatted}
                          </span>
                        </div>

                        {/* Metadata */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate text-xs" title={item.title}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{item.channelTitle}</p>
                        </div>

                        {/* Actions: Add to Queue & Save to Playlist */}
                        <div className="flex items-center gap-1 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Save to Playlist"
                              >
                                <FolderPlus className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-surface border-border text-xs">
                              <DropdownMenuLabel className="text-[10px] uppercase font-mono text-muted-foreground">
                                Save to Playlist
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator className="bg-border" />
                              {playlists.length === 0 ? (
                                <div className="p-2 text-[11px] text-muted-foreground text-center">
                                  No playlists found
                                </div>
                              ) : (
                                playlists.map((pl) => (
                                  <DropdownMenuItem
                                    key={pl.id}
                                    onClick={() => handleSaveToPlaylist(pl.id, item)}
                                    className="cursor-pointer flex items-center justify-between text-xs"
                                  >
                                    <span className="truncate">{pl.name}</span>
                                    <Badge variant="outline" className="text-[9px] font-mono py-0 px-1 ml-1 shrink-0">
                                      {pl.item_count || 0}
                                    </Badge>
                                  </DropdownMenuItem>
                                ))
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            size="sm"
                            variant={isAdded ? 'outline' : 'default'}
                            onClick={() => handleQueueTrack(item)}
                            disabled={isAdding || isAdded}
                            className="h-7 px-2.5 text-xs gap-1 font-medium"
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
                                <span>Queue</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : query && !isSearching ? (
                  <div className="h-36 flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <p>No tracks found for "{query}".</p>
                    <p className="text-[11px] mt-1">Try another search or paste a direct YouTube video URL.</p>
                  </div>
                ) : !query ? (
                  <div className="h-36 flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <Music className="h-6 w-6 mb-2 opacity-40" />
                    <p>Search for songs, artists, or audio streams</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                      All connected participants will hear this track in sync.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            /* Direct Link Tab */
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-1.5">
                  YouTube Video Link or ID
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={directInput}
                    onChange={(e) => setDirectInput(e.target.value)}
                    placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or dQw4w9WgXcQ"
                    className="pl-9 h-9 text-xs bg-muted/30 border-border font-mono"
                    autoFocus
                  />
                  {isValidatingDirect && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                  )}
                </div>
                {directError && <p className="text-[11px] text-destructive mt-1.5">{directError}</p>}
              </div>

              {/* Preview Card */}
              {directPreview && (
                <div className="p-3 rounded border border-border bg-surface flex items-center gap-3">
                  <div className="relative h-16 w-28 rounded overflow-hidden bg-black shrink-0 border border-border">
                    <img
                      src={directPreview.thumbnailUrl}
                      alt={directPreview.title}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 right-1 bg-black/85 text-[9px] font-mono px-1 py-0.2 rounded text-zinc-300">
                      {directPreview.durationFormatted}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Badge variant="outline" className="text-[9px] font-mono mb-1">
                      ID: {directPreview.id}
                    </Badge>
                    <p className="font-semibold text-foreground truncate text-xs">{directPreview.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{directPreview.channelTitle}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Save to Playlist"
                        >
                          <FolderPlus className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-surface border-border text-xs">
                        <DropdownMenuLabel className="text-[10px] uppercase font-mono text-muted-foreground">
                          Save to Playlist
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-border" />
                        {playlists.length === 0 ? (
                          <div className="p-2 text-[11px] text-muted-foreground text-center">
                            No playlists found
                          </div>
                        ) : (
                          playlists.map((pl) => (
                            <DropdownMenuItem
                              key={pl.id}
                              onClick={() => handleSaveToPlaylist(pl.id, directPreview)}
                              className="cursor-pointer flex items-center justify-between text-xs"
                            >
                              <span className="truncate">{pl.name}</span>
                              <Badge variant="outline" className="text-[9px] font-mono py-0 px-1 ml-1 shrink-0">
                                {pl.item_count || 0}
                              </Badge>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                      size="sm"
                      variant={addedIds.has(directPreview.id) ? 'outline' : 'default'}
                      onClick={() => handleQueueTrack(directPreview)}
                      disabled={addingId === directPreview.id || addedIds.has(directPreview.id)}
                      className="h-8 px-3 text-xs gap-1.5 font-medium"
                    >
                      {addingId === directPreview.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : addedIds.has(directPreview.id) ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Enqueued</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          <span>Enqueue Track</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="p-3 rounded bg-muted/30 border border-border text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Direct Link Benefits:</p>
                <p>• Bypasses YouTube Search API quota completely.</p>
                <p>• Supports YouTube Shorts, music.youtube.com, and mobile youtu.be links.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted-foreground font-mono">
            Tracks are enqueued instantly for all room listeners
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs px-3">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
