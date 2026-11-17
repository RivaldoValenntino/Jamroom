import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass,
  Search,
  Users,
  Lock,
  Globe,
  Plus,
  Volume2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useUiStore } from '@/stores/useUiStore';

// Sample mock rooms for Phase 1 UI verification
const MOCK_ROOMS = [
  {
    id: 'room-1',
    slug: 'lofi-beats-lounge',
    name: 'Lo-Fi Chill & Code Beats',
    description: 'Relaxing 24/7 lo-fi hip hop, synthwave, and chillhop for study and deep focus.',
    privacy: 'public',
    current_song: 'Lofi Girl - 1 A.M Study Session',
    members_count: 24,
    is_playing: true,
    cover_url: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&auto=format&fit=crop&q=80',
    tags: ['Lofi', 'Study', 'Chill'],
  },
  {
    id: 'room-2',
    slug: 'synthwave-cyberpunk',
    name: 'Cyberpunk Neon Radio 2077',
    description: 'Dark synth, retro electro, outrun and future bass for midnight hackers.',
    privacy: 'public',
    current_song: 'Carpenter Brut - Turbo Killer',
    members_count: 18,
    is_playing: true,
    cover_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
    tags: ['Synthwave', 'Cyberpunk', 'Electronic'],
  },
  {
    id: 'room-3',
    slug: 'deep-house-sessions',
    name: 'Deep House & Melodic Techno',
    description: 'Smooth weekend sunset vibes curated live with open shared speakers.',
    privacy: 'public',
    current_song: 'RÜFÜS DU SOL - Innerbloom',
    members_count: 31,
    is_playing: true,
    cover_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
    tags: ['Deep House', 'Techno', 'Party'],
  },
  {
    id: 'room-4',
    slug: 'indie-rock-favorites',
    name: 'Indie Rock & Bedroom Pop',
    description: 'Community collaborative queue: add your favorite underground gems.',
    privacy: 'password',
    current_song: 'Tame Impala - The Less I Know The Better',
    members_count: 12,
    is_playing: true,
    cover_url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80',
    tags: ['Indie', 'Alternative', 'Rock'],
  },
];

export function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);

  const filteredRooms = MOCK_ROOMS.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 py-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Explore Live Lounges
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Join ongoing synchronized music listening rooms or spin up your own party.
          </p>
        </div>

        <Button
          variant="gradient"
          onClick={() => setCreateRoomOpen(true)}
          className="gap-2 font-semibold"
        >
          <Plus className="h-4 w-4" />
          Create New Room
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="relative mb-8">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by room title, genre, artist, or tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 bg-surface/60 border-border text-base focus-visible:ring-primary rounded-xl"
        />
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRooms.map((room) => (
          <Link key={room.id} to={`/rooms/${room.slug}`}>
            <Card className="glass-panel-interactive border-border/40 overflow-hidden group h-full flex flex-col cursor-pointer">
              {/* Room Cover Image */}
              <div className="relative h-44 w-full overflow-hidden bg-muted">
                <img
                  src={room.cover_url}
                  alt={room.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

                {/* Privacy Badge */}
                <div className="absolute top-3 left-3">
                  {room.privacy === 'password' ? (
                    <Badge variant="warning" className="gap-1 backdrop-blur-md">
                      <Lock className="h-3 w-3" />
                      Protected
                    </Badge>
                  ) : (
                    <Badge variant="default" className="gap-1 backdrop-blur-md">
                      <Globe className="h-3 w-3" />
                      Public
                    </Badge>
                  )}
                </div>

                {/* Active Listeners Count */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Users className="h-3.5 w-3.5" />
                  <span>{room.members_count}</span>
                </div>

                {/* Now Playing Overlay Banner */}
                <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur-md px-3 py-1.5 text-xs text-foreground/90">
                  <Volume2 className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="truncate font-medium">{room.current_song}</span>
                </div>
              </div>

              {/* Room Metadata */}
              <CardContent className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1">
                    {room.name}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                    {room.description}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
                  {room.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
