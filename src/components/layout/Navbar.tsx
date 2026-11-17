import { Link, useLocation } from 'react-router-dom';
import { Compass, Plus, User, Radio, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';

export function Navbar() {
  const location = useLocation();
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);
  const profile = useAuthStore((s) => s.profile);
  const setIsOnboardingOpen = useAuthStore((s) => s.setIsOnboardingOpen);

  const isExplore = location.pathname === '/explore';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm py-2">
      <div className="container mx-auto flex h-13 items-center justify-between px-4 sm:px-6">
        {/* Brand Logo & Navigation */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground font-bold tracking-tight text-sm hover:opacity-90 transition-opacity"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Radio className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight">JAMROOM</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" title="System Online" />
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-xs">
            <Link
              to="/explore"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                isExplore
                  ? 'bg-surface text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Live Lounges
            </Link>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="default"
            size="sm"
            onClick={() => setCreateRoomOpen(true)}
            className="h-8 gap-1.5 text-xs font-semibold px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Room</span>
          </Button>

          {/* Guest Identity Profile Trigger */}
          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface hover:bg-surface-hover px-2.5 text-xs text-foreground transition-colors"
            title="Edit Guest Profile"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground overflow-hidden shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-3 w-3" />
              )}
            </div>
            <span className="font-medium max-w-[120px] truncate">
              {profile?.display_name || 'Guest'}
            </span>
            <Settings className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
}
