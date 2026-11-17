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
  Disc3,
  Plus,
  Radio,
  Flame,
  Sparkles,
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
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background overflow-hidden">
      {/* Room Stage Header */}
      <div className="h-12 border-b border-border/60 bg-surface/40 px-4 sm:px-6 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 truncate">
          <Badge variant="default" className="text-[10px] gap-1 py-0">
            <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-400" />
            SYNCHRONIZED
          </Badge>
          <span className="font-bold text-foreground text-sm truncate">
            {slugOrId ? slugOrId.replace(/-/g, ' ').toUpperCase() : 'LO-FI STUDY LOUNGE'}
          </span>
          <span className="text-muted-foreground hidden md:inline">• DJ Mode (Host Controlled)</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Responsive Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: Collaborative Queue (Hidden on Mobile unless Queue Tab selected) */}
        <section
          className={`lg:col-span-3 border-r border-border/60 bg-surface/20 flex flex-col h-full overflow-hidden ${
            activeTab === 'queue' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          <div className="p-3.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="h-4 w-4 text-primary" />
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Collaborative Queue (3)
              </span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 font-semibold text-primary">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Playing item */}
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/10 flex items-center gap-3">
              <div className="relative h-12 w-12 rounded bg-black/40 overflow-hidden shrink-0">
                <Disc3 className="h-full w-full p-2 text-primary animate-spin-slow" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="text-[9px] px-1 py-0">NOW</Badge>
                  <p className="text-xs font-bold text-foreground truncate">One More Time</p>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">Daft Punk • 05:20</p>
              </div>
            </div>

            {/* Upcoming items */}
            <div className="p-3 rounded-lg border border-border/40 bg-surface/40 hover:bg-surface-hover flex items-center gap-3 transition-colors">
              <div className="h-10 w-10 rounded bg-muted/40 shrink-0 flex items-center justify-center text-xs font-bold text-muted-foreground">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Starboy</p>
                <p className="text-[11px] text-muted-foreground truncate">The Weeknd • Queued by Sam</p>
              </div>
              <span className="text-[10px] text-muted-foreground">03:50</span>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-surface/40 hover:bg-surface-hover flex items-center gap-3 transition-colors">
              <div className="h-10 w-10 rounded bg-muted/40 shrink-0 flex items-center justify-center text-xs font-bold text-muted-foreground">
                3
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Levitating</p>
                <p className="text-[11px] text-muted-foreground truncate">Dua Lipa • Queued by Jordan</p>
              </div>
              <span className="text-[10px] text-muted-foreground">03:23</span>
            </div>
          </div>
        </section>

        {/* CENTER STAGE: Video Player & Authoritative Controls */}
        <section
          className={`lg:col-span-6 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto ${
            activeTab === 'player' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          {/* 16:9 Video Player Viewport Container */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-border/80 bg-black shadow-2xl flex items-center justify-center group">
            {/* Visual Placeholder for YouTube IFrame in Phase 1 */}
            <div className="text-center p-6 flex flex-col items-center">
              <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-primary to-secondary p-1 shadow-2xl shadow-primary/40 mb-4 animate-spin-slow">
                <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
                  <Disc3 className="h-10 w-10 text-primary" />
                </div>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-foreground mb-1">
                Daft Punk — One More Time
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Authoritative Master Stream • 12 Listeners Synchronized
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="gradient" className="gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Join Listening (Enable Audio)
                </Button>
              </div>
            </div>

            {/* Floating Live Indicator */}
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>LIVE IN SYNC</span>
            </div>
          </div>

          {/* Player Controls Bar */}
          <div className="mt-6 glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
            {/* Scrubber Progress Bar */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-muted-foreground">01:24</span>
              <Slider defaultValue={[25]} max={100} step={1} className="flex-1" />
              <span className="text-[11px] font-mono text-muted-foreground">05:20</span>
            </div>

            {/* Playback Button Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="gradient"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="h-11 w-11 rounded-full shadow-lg shadow-primary/30"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                </Button>

                <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                  <SkipForward className="h-4 w-4" />
                </Button>

                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold ml-2">
                  <Flame className="h-3.5 w-3.5 text-accent" />
                  Vote Skip (2/5)
                </Button>
              </div>

              {/* Volume Slider */}
              <div className="hidden sm:flex items-center gap-2 w-36">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={(val) => {
                    setVolume(val[0]);
                    setIsMuted(false);
                  }}
                  max={100}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Chat & Presence (Hidden on Mobile unless Chat Tab selected) */}
        <section
          className={`lg:col-span-3 border-l border-border/60 bg-surface/20 flex flex-col h-full overflow-hidden ${
            activeTab === 'chat' || activeTab === 'members' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          {/* Header with Presence pill */}
          <div className="p-3.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-secondary" />
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                Room Chat
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>12 Online</span>
            </div>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            <div className="text-center my-2 text-[10px] text-muted-foreground">
              Welcome to the lounge! Be respectful and enjoy the music.
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-bold text-primary">
                <span>DJ Alex</span>
                <Badge variant="default" className="text-[9px] px-1 py-0">HOST</Badge>
              </div>
              <p className="text-foreground bg-surface/80 p-2.5 rounded-lg rounded-tl-none border border-border/30">
                Welcome everyone! Feel free to queue songs anytime.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-bold text-secondary">
                <span>Sarah</span>
              </div>
              <p className="text-foreground bg-surface/80 p-2.5 rounded-lg rounded-tl-none border border-border/30">
                That bass drop was insane 🔥
              </p>
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-border/40 bg-surface/30 flex items-center gap-2">
            <Input placeholder="Say something..." className="h-9 bg-surface text-xs rounded-lg" />
            <Button size="sm" variant="secondary" className="h-9 px-3 text-xs font-semibold">
              Send
            </Button>
          </div>
        </section>
      </div>

      {/* MOBILE BOTTOM NAVIGATION TABS (Visible only on screens <= 1024px) */}
      <nav className="lg:hidden h-14 border-t border-border/60 bg-surface flex items-center justify-around px-2 z-30">
        <button
          onClick={() => setActiveTab('player')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeTab === 'player' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Play className="h-4 w-4" />
          <span>Stage</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeTab === 'queue' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <ListMusic className="h-4 w-4" />
          <span>Queue (3)</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeTab === 'members' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>People (12)</span>
        </button>
      </nav>
    </div>
  );
}
