import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Users,
  MessageSquare,
  ListMusic,
  Share2,
  Settings,
  Disc,
  Plus,
  Flame,
  Volume1,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

export function RoomPage() {
  const { slugOrId } = useParams();
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'chat' | 'members'>('player');

  return (
    <div className="flex h-[calc(100vh-3.25rem)] flex-col bg-background overflow-hidden">
      {/* Studio Stage Top Bar */}
      <div className="h-10 border-b border-border bg-surface/50 px-4 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2.5 truncate">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-foreground text-xs uppercase tracking-wider truncate">
            {slugOrId ? slugOrId.replace(/-/g, ' ') : 'LO-FI STUDY LOUNGE'}
          </span>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex py-0 px-1.5 font-mono">
            HOST DJ MODE
          </Badge>
          <span className="text-[11px] font-mono text-muted-foreground hidden md:inline">
            DRIFT: &lt;0.05s (SYNCED)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2 font-medium">
            <Share2 className="h-3 w-3" />
            <span>Invite</span>
          </Button>
          <Button variant="ghost" size="icon-sm" className="h-6 w-6">
            <Settings className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main Responsive 3-Column Studio Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: Collaborative Queue */}
        <section
          className={`lg:col-span-3 border-r border-border bg-surface/30 flex flex-col h-full overflow-hidden ${
            activeTab === 'queue' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-1.5">
              <ListMusic className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                Queue (3)
              </span>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 px-2 font-medium text-primary">
              <Plus className="h-3 w-3" />
              Add Song
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Now Playing Item */}
            <div className="p-2 rounded border border-primary/40 bg-primary/10 flex items-center gap-2.5 text-xs">
              <div className="h-7 w-7 rounded bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                <Disc className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Badge variant="default" className="text-[9px] px-1 py-0">NOW</Badge>
                  <p className="font-semibold text-foreground truncate text-[11px]">One More Time</p>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">Daft Punk • 05:20</p>
              </div>
            </div>

            {/* Upcoming Queue Items */}
            <div className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center gap-2.5 text-xs transition-colors">
              <span className="w-5 text-center font-mono text-[11px] text-muted-foreground">2</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate text-[11px]">Starboy</p>
                <p className="text-[10px] text-muted-foreground truncate">The Weeknd • Queued by Sam</p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">03:50</span>
            </div>

            <div className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center gap-2.5 text-xs transition-colors">
              <span className="w-5 text-center font-mono text-[11px] text-muted-foreground">3</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate text-[11px]">Levitating</p>
                <p className="text-[10px] text-muted-foreground truncate">Dua Lipa • Queued by Jordan</p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">03:23</span>
            </div>
          </div>
        </section>

        {/* CENTER STAGE: Synchronized YouTube Player & Controls */}
        <section
          className={`lg:col-span-6 flex flex-col justify-between p-4 overflow-y-auto ${
            activeTab === 'player' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          {/* YouTube Video Container (16:9 Standard, visible at all times) */}
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-black flex flex-col items-center justify-center">
            {/* Visual Screen Container */}
            <div className="text-center p-4 max-w-sm">
              <p className="text-xs uppercase font-mono tracking-wider text-muted-foreground mb-1">
                Now Synchronizing Audio
              </p>
              <h2 className="text-base font-bold text-foreground mb-1">
                Daft Punk — One More Time
              </h2>
              <p className="text-xs text-muted-foreground font-mono mb-4">
                Master Audio: YouTube IFrame Engine • 12 Active Devices
              </p>
              <Button size="sm" variant="default" className="gap-1.5 text-xs h-8 px-4 font-semibold">
                <Volume1 className="h-3.5 w-3.5" />
                Join Listening (Enable Audio)
              </Button>
            </div>

            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded bg-black/80 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>IN SYNC</span>
            </div>
          </div>

          {/* Authoritative Playback Controls Bar */}
          <div className="mt-4 border border-border rounded-lg bg-surface p-3 flex flex-col gap-2.5">
            {/* Scrub Progress Bar */}
            <div className="flex items-center gap-2.5 text-[11px] font-mono text-muted-foreground">
              <span>01:24</span>
              <Slider defaultValue={[26]} max={100} step={1} className="flex-1" />
              <span>05:20</span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="h-8 w-8 p-0"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </Button>

                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                  <SkipForward className="h-4 w-4" />
                </Button>

                <div className="h-4 w-px bg-border mx-1" />

                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] font-mono px-2">
                  <Flame className="h-3 w-3 text-amber-400" />
                  <span>Skip (2/5)</span>
                </Button>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 w-32">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Toggle Mute"
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={(val) => {
                    setVolume(val[0]);
                    setIsMuted(false);
                  }}
                  max={100}
                  className="flex-1"
                />
                <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">
                  {isMuted ? '0%' : `${volume}%`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Chat & Presence */}
        <section
          className={`lg:col-span-3 border-l border-border bg-surface/30 flex flex-col h-full overflow-hidden ${
            activeTab === 'chat' || activeTab === 'members' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                Chat & Presence
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>12</span>
            </div>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            <div className="text-center my-1 text-[10px] text-muted-foreground font-mono">
              Session started • Master clock synchronized
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-primary">DJ Alex</span>
                <Badge variant="default" className="text-[8px] px-1 py-0">HOST</Badge>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto">14:02</span>
              </div>
              <p className="text-foreground text-xs bg-surface p-2 rounded border border-border">
                Welcome everyone! Queue is open for additions.
              </p>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-foreground">Sarah</span>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto">14:05</span>
              </div>
              <p className="text-foreground text-xs bg-surface p-2 rounded border border-border">
                Sounding crystal clear on my headphones 👍
              </p>
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-2 border-t border-border bg-surface flex items-center gap-1.5">
            <Input placeholder="Message room..." className="h-7 text-xs bg-muted/50 border-border rounded" />
            <Button size="sm" variant="default" className="h-7 px-3 text-xs font-semibold">
              Send
            </Button>
          </div>
        </section>
      </div>

      {/* MOBILE BOTTOM TABS */}
      <nav className="lg:hidden h-12 border-t border-border bg-surface flex items-center justify-around px-2 shrink-0">
        <button
          onClick={() => setActiveTab('player')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'player' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Play className="h-3.5 w-3.5 mb-0.5" />
          <span>Stage</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'queue' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <ListMusic className="h-3.5 w-3.5 mb-0.5" />
          <span>Queue (3)</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 mb-0.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'members' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="h-3.5 w-3.5 mb-0.5" />
          <span>Users (12)</span>
        </button>
      </nav>
    </div>
  );
}
