import { Link, useLocation } from 'react-router-dom';
import { Compass, Plus, User, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';

export function Navbar() {
  const location = useLocation();
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);
  const profile = useAuthStore((s) => s.profile);
  const setIsOnboardingOpen = useAuthStore((s) => s.setIsOnboardingOpen);

  const isExplore = location.pathname === '/explore';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-secondary shadow-md shadow-primary/20">
              <Radio className="h-5 w-5 text-white animate-pulse-subtle" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
                  JAMROOM
                </span>
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  LIVE
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground font-medium -mt-1 hidden sm:inline-block">
                Synchronized Music Lounges
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/explore">
              <Button
                variant={isExplore ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-2 text-xs font-semibold"
              >
                <Compass className="h-4 w-4" />
                Explore Rooms
              </Button>
            </Link>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setCreateRoomOpen(true)}
            className="gap-1.5 text-xs sm:text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create Room</span>
            <span className="sm:hidden">New</span>
          </Button>

          {/* Guest Identity Tag / Profile Trigger */}
          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border/80 bg-surface/80 hover:bg-surface-hover py-1 px-2.5 sm:px-3 text-xs transition-colors"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="font-medium text-foreground max-w-[100px] truncate hidden sm:inline-block">
              {profile?.display_name || 'Guest'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
