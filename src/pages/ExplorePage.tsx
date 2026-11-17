import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass,
  Search,
  Lock,
  Globe,
  Plus,
  Volume2,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUiStore } from '@/stores/useUiStore';
import { useExploreRooms } from '@/features/room/hooks/useExploreRooms';
import { fetchRoomCategories, DEFAULT_ROOM_CATEGORIES } from '@/features/room/services/roomService';
import type { RoomCategory } from '@/types/database.types';

const DEMO_ROOMS = [
  {
    id: 'room-1',
    slug: 'lofi-beats-lounge',
    name: 'Lo-Fi Chill & Code Beats',
    description: 'Relaxing 24/7 lo-fi hip hop, synthwave, and chillhop for study and deep focus.',
    privacy: 'public' as const,
    category: { id: 'cat-lo-fi', name: 'Lo-fi', slug: 'lo-fi', description: null },
    current_song: 'Lofi Girl - 1 A.M Study Session',
    duration: '03:42',
    members_count: 24,
    settings: { shared_speakers: false },
  },
  {
    id: 'room-2',
    slug: 'synthwave-cyberpunk',
    name: 'Cyberpunk Neon Radio 2077',
    description: 'Dark synth, retro electro, outrun and future bass for midnight hackers.',
    privacy: 'public' as const,
    category: { id: 'cat-electronic', name: 'Electronic', slug: 'electronic', description: null },
    current_song: 'Carpenter Brut - Turbo Killer',
    duration: '04:15',
    members_count: 18,
    settings: { shared_speakers: true },
  },
  {
    id: 'room-3',
    slug: 'deep-house-sessions',
    name: 'Deep House & Melodic Techno',
    description: 'Smooth weekend sunset vibes curated live with open shared speakers.',
    privacy: 'public' as const,
    category: { id: 'cat-electronic', name: 'Electronic', slug: 'electronic', description: null },
    current_song: 'RÜFÜS DU SOL - Innerbloom',
    duration: '09:38',
    members_count: 31,
    settings: { shared_speakers: false },
  },
  {
    id: 'room-4',
    slug: 'indie-rock-favorites',
    name: 'Indie Rock & Bedroom Pop',
    description: 'Community collaborative queue: add your favorite underground gems.',
    privacy: 'password' as const,
    category: { id: 'cat-indie', name: 'Indie', slug: 'indie', description: null },
    current_song: 'Tame Impala - The Less I Know The Better',
    duration: '03:36',
    members_count: 12,
    settings: { shared_speakers: true },
  },
];

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<RoomCategory[]>(DEFAULT_ROOM_CATEGORIES);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [filterPrivacy, setFilterPrivacy] = useState<'all' | 'public' | 'password'>('all');
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);

  useEffect(() => {
    fetchRoomCategories().then((cats) => {
      if (cats && cats.length > 0) setCategories(cats);
    });
  }, []);

  // Live remote query with category filter
  const { data: remoteRooms, isLoading } = useExploreRooms(searchQuery, selectedCategory);

  // Combine remote with demo fallback if table is newly seeded
  const activeRooms = remoteRooms && remoteRooms.length > 0 ? remoteRooms : DEMO_ROOMS;

  const filteredRooms = activeRooms.filter((room) => {
    const matchesSearch =
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.description && room.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      room.slug.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPrivacy = filterPrivacy === 'all' || room.privacy === filterPrivacy;
    const matchesCategory =
      selectedCategory === 'all' ||
      room.category?.slug === selectedCategory ||
      (room as any).category_id === selectedCategory;

    return matchesSearch && matchesPrivacy && matchesCategory;
  });

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 max-w-5xl">
      {/* Directory Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-4 w-4 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Live Lounge Directory
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
              {filteredRooms.length} Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Browse live collaborative sessions or launch your own room.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-md p-0.5 bg-surface">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Table View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => setCreateRoomOpen(true)}
            className="h-8 gap-1.5 text-xs font-semibold px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            New Room
          </Button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mb-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by room title, track name, host, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 bg-surface border-border text-xs rounded-md"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setFilterPrivacy('all')}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              filterPrivacy === 'all'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterPrivacy('public')}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              filterPrivacy === 'public'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground'
            }`}
          >
            Public
          </button>
          <button
            onClick={() => setFilterPrivacy('password')}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              filterPrivacy === 'password'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground'
            }`}
          >
            Protected
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-6 text-xs scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors font-medium border ${
            selectedCategory === 'all'
              ? 'border-primary bg-primary/10 text-primary font-semibold'
              : 'border-border bg-surface text-muted-foreground hover:text-foreground'
          }`}
        >
          All Genres
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.slug)}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors border ${
              selectedCategory === cat.slug
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-xs text-muted-foreground font-mono">
          Loading live directory...
        </div>
      )}

      {/* Table View (Information-Dense Default) */}
      {!isLoading && viewMode === 'table' ? (
        <div className="border border-border rounded-md overflow-hidden bg-surface">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border bg-muted/40 uppercase tracking-wider">
            <div className="col-span-6 md:col-span-5">Room / Category</div>
            <div className="col-span-4 md:col-span-5">Status & Mode</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          <div className="divide-y divide-border/60">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-surface-hover transition-colors text-xs"
              >
                {/* Room Title, Privacy & Slug */}
                <div className="col-span-6 md:col-span-5 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {room.privacy === 'password' ? (
                      <span title="Password Protected">
                        <Lock className="h-3 w-3 text-amber-400 shrink-0" />
                      </span>
                    ) : (
                      <span title="Public">
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                      </span>
                    )}
                    <Link
                      to={`/rooms/${room.slug}`}
                      className="font-semibold text-foreground hover:text-primary truncate"
                    >
                      {room.name}
                    </Link>
                    {room.category?.name && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono py-0 px-1 text-muted-foreground border-border shrink-0"
                      >
                        {room.category.name}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    /{room.slug}
                  </div>
                </div>

                {/* Status & Mode */}
                <div className="col-span-4 md:col-span-5 min-w-0">
                  <div className="flex items-center gap-1.5 text-foreground truncate">
                    <Volume2 className="h-3 w-3 text-primary shrink-0 animate-pulse" />
                    <span className="truncate text-[11px]">
                      {(room as any).current_song || 'Ready for playback'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {room.settings?.shared_speakers ? 'Party Mode (Open DJ)' : 'Host Mode (Curated)'}
                  </span>
                </div>

                {/* Action */}
                <div className="col-span-2 flex justify-end">
                  <Link to={`/rooms/${room.slug}`}>
                    <Button size="sm" variant="outline" className="h-7 px-3 text-xs font-medium">
                      Join
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !isLoading ? (
        /* Compact Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRooms.map((room) => (
            <div
              key={room.id}
              className="ui-panel p-3.5 rounded-md flex flex-col justify-between hover:border-muted-foreground/30 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={room.privacy === 'password' ? 'warning' : 'outline'} className="text-[10px]">
                      {room.privacy === 'password' ? 'Protected' : 'Public'}
                    </Badge>
                    {room.category?.name && (
                      <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border">
                        {room.category.name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>Live</span>
                  </div>
                </div>

                <Link
                  to={`/rooms/${room.slug}`}
                  className="font-semibold text-sm text-foreground hover:text-primary line-clamp-1 mb-1 block"
                >
                  {room.name}
                </Link>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                  {room.description || 'Synchronized collaborative listening room.'}
                </p>
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {room.settings?.shared_speakers ? 'Party Mode' : 'Host Mode'}
                </span>
                <Link to={`/rooms/${room.slug}`} className="shrink-0">
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                    Join
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
