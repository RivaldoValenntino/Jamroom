import { Link } from 'react-router-dom';
import {
  Radio,
  Users,
  Sparkles,
  Zap,
  ShieldCheck,
  Disc3,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUiStore } from '@/stores/useUiStore';

export function HomePage() {
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);

  return (
    <div className="relative overflow-hidden">
      {/* Background Neon Glow Orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-primary/20 via-purple-600/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-96 -left-48 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" />
      <div className="pointer-events-none absolute top-96 -right-48 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 pt-16 pb-24 text-center relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6 animate-pulse-subtle">
          <Sparkles className="h-3.5 w-3.5 text-secondary" />
          <span>Zero Sign-Up Required • Guest Identity Instant Play</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.1] mb-6">
          Listen Together.{' '}
          <span className="bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent">
            Every Device
          </span>{' '}
          In Sync.
        </h1>

        <p className="text-muted-foreground text-base sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Create collaborative virtual listening rooms powered by YouTube. Every friend hears the exact same beat at the exact same second — right in your browser.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-16">
          <Button
            size="lg"
            variant="gradient"
            onClick={() => setCreateRoomOpen(true)}
            className="w-full sm:w-auto gap-2 text-base px-8 py-6 rounded-xl shadow-xl shadow-primary/30 hover:scale-105 transition-transform"
          >
            <Radio className="h-5 w-5" />
            Create a Room
          </Button>

          <Link to="/explore" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto gap-2 text-base px-8 py-6 rounded-xl hover:bg-surface-hover hover:border-primary/50 transition-all"
            >
              Explore Public Lounges
              <ArrowRight className="h-4 w-4 text-secondary" />
            </Button>
          </Link>
        </div>

        {/* Feature Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
          <Card className="glass-panel-interactive border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                <Disc3 className="h-5 w-5 animate-spin-slow" />
              </div>
              <h3 className="font-bold text-sm text-foreground">Synchronized Audio</h3>
              <p className="text-xs text-muted-foreground">
                Authoritative backend sync engine with drift correction.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel-interactive border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="h-9 w-9 rounded-lg bg-secondary/20 flex items-center justify-center text-secondary">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-foreground">Collaborative Queue</h3>
              <p className="text-xs text-muted-foreground">
                Anyone can add YouTube tracks, vote to skip, or curate music.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel-interactive border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-foreground">Instant Guest Access</h3>
              <p className="text-xs text-muted-foreground">
                No sign-up wall. Pick a display name and join in 5 seconds.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel-interactive border-border/40">
            <CardContent className="p-5 flex flex-col gap-2">
              <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-foreground">Private & Protected</h3>
              <p className="text-xs text-muted-foreground">
                Create public lounges, unlisted links, or passcode rooms.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
