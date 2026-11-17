import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Radio,
  ArrowRight,
  Users,
  Volume2,
  Lock,
  Globe,
  Sliders,
  Shield,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUiStore } from '@/stores/useUiStore';

// Representative real-time rooms
const ACTIVE_ROOMS_PREVIEW = [
  {
    id: 'room-1',
    slug: 'lofi-beats-lounge',
    name: 'Lo-Fi Chill & Code Beats',
    current_song: 'Lofi Girl - 1 A.M Study Session',
    duration: '03:42',
    host: 'DJ Alex',
    privacy: 'public',
    members_count: 24,
    shared_speakers: false,
  },
  {
    id: 'room-2',
    slug: 'synthwave-cyberpunk',
    name: 'Cyberpunk Neon Radio 2077',
    current_song: 'Carpenter Brut - Turbo Killer',
    duration: '04:15',
    host: 'CyberSam',
    privacy: 'public',
    members_count: 18,
    shared_speakers: true,
  },
  {
    id: 'room-3',
    slug: 'deep-house-sessions',
    name: 'Deep House & Melodic Techno',
    current_song: 'RÜFÜS DU SOL - Innerbloom',
    duration: '09:38',
    host: 'Elena',
    privacy: 'public',
    members_count: 31,
    shared_speakers: false,
  },
  {
    id: 'room-4',
    slug: 'indie-rock-favorites',
    name: 'Indie Rock & Bedroom Pop',
    current_song: 'Tame Impala - The Less I Know The Better',
    duration: '03:36',
    host: 'Jordan',
    privacy: 'password',
    members_count: 12,
    shared_speakers: true,
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);
  const [quickJoinInput, setQuickJoinInput] = useState('');

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickJoinInput.trim()) return;

    // Handle full URL or plain slug
    let slug = quickJoinInput.trim();
    if (slug.includes('/rooms/')) {
      slug = slug.split('/rooms/')[1].split('?')[0].split('#')[0];
    }
    navigate(`/rooms/${slug}`);
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 max-w-5xl">
      {/* Top Utility Header & Pitch */}
      <div className="border-b border-border pb-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span>SYNCHRONIZED AUDIO PLATFORM</span>
              <span>•</span>
              <span>GUEST ONLY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
              Collaborative Music Lounges. All Devices In Sync.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every connected participant plays the exact same YouTube track at the exact same millisecond. No audio screen-sharing, no registration walls, no credentials required.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="shrink-0">
            <Button
              onClick={() => setCreateRoomOpen(true)}
              className="h-10 px-5 gap-2 text-xs font-semibold"
            >
              <Radio className="h-4 w-4" />
              Start New Room
            </Button>
          </div>
        </div>

        {/* Quick Join Input Bar */}
        <form onSubmit={handleQuickJoin} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-xl">
          <Input
            placeholder="Paste room link or enter code (e.g. lofi-beats-lounge)..."
            value={quickJoinInput}
            onChange={(e) => setQuickJoinInput(e.target.value)}
            className="h-9 text-xs bg-surface border-border font-mono"
          />
          <Button type="submit" variant="secondary" className="h-9 text-xs px-4 font-semibold shrink-0">
            Join Room
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </form>
      </div>

      {/* Technical Specifications Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="ui-panel p-3 rounded-md">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span>Authoritative Sync</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Server timestamp master clock with drift correction (&lt;0.75s).
          </p>
        </div>

        <div className="ui-panel p-3 rounded-md">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span>Guest-Only Identity</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Supabase anonymous JWT with persistent UUID and ownership tokens.
          </p>
        </div>

        <div className="ui-panel p-3 rounded-md">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
            <Sliders className="h-3.5 w-3.5 text-primary" />
            <span>Shared Speakers</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Toggle between host-controlled DJ mode and open party mode.
          </p>
        </div>

        <div className="ui-panel p-3 rounded-md">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>Atomic Queue</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Fractional indexing with server-side democratic skip voting.
          </p>
        </div>
      </div>

      {/* Information-Dense Live Rooms Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Active Lounges
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
              {ACTIVE_ROOMS_PREVIEW.length} LIVE
            </Badge>
          </div>
          <Link
            to="/explore"
            className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
          >
            View all directory <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Structured Rooms Table */}
        <div className="border border-border rounded-md overflow-hidden bg-surface">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border bg-muted/40 uppercase tracking-wider">
            <div className="col-span-5 md:col-span-4">Room / Host</div>
            <div className="col-span-5 md:col-span-4">Now Playing</div>
            <div className="hidden md:block col-span-2 text-center">Listeners</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          <div className="divide-y divide-border/60">
            {ACTIVE_ROOMS_PREVIEW.map((room) => (
              <div
                key={room.id}
                className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-surface-hover transition-colors text-xs"
              >
                {/* Room Title & Host */}
                <div className="col-span-5 md:col-span-4 min-w-0">
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
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                    <span>Host: {room.host}</span>
                    <span>•</span>
                    <span>{room.shared_speakers ? 'Party Mode' : 'DJ Mode'}</span>
                  </div>
                </div>

                {/* Now Playing Track & Duration */}
                <div className="col-span-5 md:col-span-4 min-w-0">
                  <div className="flex items-center gap-1.5 text-foreground truncate">
                    <Volume2 className="h-3 w-3 text-primary shrink-0 animate-pulse" />
                    <span className="truncate">{room.current_song}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {room.duration}
                  </span>
                </div>

                {/* Listeners */}
                <div className="hidden md:flex col-span-2 items-center justify-center gap-1.5 font-mono text-xs">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{room.members_count}</span>
                </div>

                {/* Action Button */}
                <div className="col-span-2 flex justify-end">
                  <Link to={`/rooms/${room.slug}`}>
                    <Button size="sm" variant="outline" className="h-7 px-3 text-xs font-medium">
                      Listen
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
