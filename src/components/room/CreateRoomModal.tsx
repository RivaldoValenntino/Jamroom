import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useUiStore } from '@/stores/useUiStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Lock, Globe, EyeOff, ArrowRight } from 'lucide-react';

export function CreateRoomModal() {
  const navigate = useNavigate();
  const { isCreateRoomOpen, setCreateRoomOpen } = useUiStore();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'password'>('public');
  const [password, setPassword] = useState('');
  const [sharedSpeakers, setSharedSpeakers] = useState(false);
  const [skipThreshold] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    setSlug(autoSlug);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Room name is required');
      return;
    }
    const finalSlug = slug.trim() || `room-${Math.floor(1000 + Math.random() * 9000)}`;
    if (privacy === 'password' && !password.trim()) {
      setErrorMsg('Password is required for password-protected rooms');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      // In Phase 2/3, we navigate directly to the room slug
      setCreateRoomOpen(false);
      navigate(`/rooms/${finalSlug}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isCreateRoomOpen} onOpenChange={setCreateRoomOpen}>
      <DialogContent className="max-w-md p-5 bg-surface border-border">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-foreground">
              Create Virtual Lounge
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              HOST: {profile?.display_name || 'GUEST'}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Set up an authoritative synchronized listening room with YouTube playback.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-3.5 pt-2">
          {errorMsg && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {errorMsg}
            </div>
          )}

          {/* Room Name */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Room Title
            </label>
            <Input
              placeholder="e.g. Synthwave Midnight Coding"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="h-8 text-xs bg-muted/40 border-border"
              maxLength={60}
              required
            />
          </div>

          {/* Custom Slug */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Room URL Slug
            </label>
            <div className="flex items-center text-xs font-mono rounded border border-border bg-muted/30 px-2.5 h-8">
              <span className="text-muted-foreground select-none">jamroom.live/rooms/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="custom-slug"
                className="flex-1 bg-transparent border-0 outline-none text-foreground font-mono text-xs pl-0.5"
                maxLength={40}
              />
            </div>
          </div>

          {/* Privacy Class */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Access & Privacy
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPrivacy('public')}
                className={`p-2 rounded border text-left flex flex-col gap-0.5 transition-colors ${
                  privacy === 'public'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-foreground">
                  <Globe className="h-3 w-3 text-primary" />
                  <span>Public</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Listed in Lobby</span>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('unlisted')}
                className={`p-2 rounded border text-left flex flex-col gap-0.5 transition-colors ${
                  privacy === 'unlisted'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-foreground">
                  <EyeOff className="h-3 w-3 text-primary" />
                  <span>Unlisted</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Direct link only</span>
              </button>

              <button
                type="button"
                onClick={() => setPrivacy('password')}
                className={`p-2 rounded border text-left flex flex-col gap-0.5 transition-colors ${
                  privacy === 'password'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs text-foreground">
                  <Lock className="h-3 w-3 text-amber-400" />
                  <span>Protected</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Passcode required</span>
              </button>
            </div>
          </div>

          {/* Conditional Passcode Input */}
          {privacy === 'password' && (
            <div className="p-2.5 rounded border border-border bg-muted/30 space-y-1">
              <label className="block text-xs font-semibold text-foreground">
                Room Passcode
              </label>
              <Input
                type="password"
                placeholder="Enter room password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-8 text-xs bg-surface border-border font-mono"
                required
              />
            </div>
          )}

          {/* Permissions / Shared Speakers Switch */}
          <div className="p-2.5 rounded border border-border bg-muted/20 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground text-xs">Shared Speakers (Party Mode)</p>
                <p className="text-[10px] text-muted-foreground">
                  Allow any listener to pause, play, or seek audio.
                </p>
              </div>
              <input
                type="checkbox"
                checked={sharedSpeakers}
                onChange={(e) => setSharedSpeakers(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Skip Vote Threshold:</span>
              <span className="font-mono font-medium text-foreground">{skipThreshold}% of listeners</span>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreateRoomOpen(false)}
              className="h-8 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              className="h-8 px-4 text-xs font-semibold gap-1.5"
            >
              <span>Launch Lounge</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
