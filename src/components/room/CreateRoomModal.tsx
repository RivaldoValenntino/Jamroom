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
import { createRoom } from '@/features/room/services/roomService';
import { Lock, Globe, EyeOff, ArrowRight, KeyRound, Copy, Check } from 'lucide-react';

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

  // Post-creation token review state
  const [createdRoomSlug, setCreatedRoomSlug] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

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
      const result = await createRoom({
        name: name.trim(),
        slug: finalSlug,
        privacy,
        password: privacy === 'password' ? password.trim() : undefined,
        settings: {
          shared_speakers: sharedSpeakers,
          skip_vote_threshold_percent: skipThreshold,
        },
      });

      setCreatedRoomSlug(result.room.slug);
      setRecoveryToken(result.recoveryToken);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyRecovery = () => {
    if (!recoveryToken) return;
    navigator.clipboard.writeText(recoveryToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleEnterRoom = () => {
    const targetSlug = createdRoomSlug;
    // Reset modal state
    setCreatedRoomSlug(null);
    setRecoveryToken(null);
    setName('');
    setSlug('');
    setPassword('');
    setCreateRoomOpen(false);
    if (targetSlug) {
      navigate(`/rooms/${targetSlug}`);
    }
  };

  return (
    <Dialog open={isCreateRoomOpen} onOpenChange={setCreateRoomOpen}>
      <DialogContent className="max-w-md p-5 bg-surface border-border">
        {recoveryToken ? (
          /* Success Screen: Display Emergency Recovery Key */
          <div className="space-y-4">
            <DialogHeader className="space-y-1 text-left pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <DialogTitle className="text-base font-bold text-foreground">
                  Room Created! Save Recovery Key
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Because JAMROOM is guest-based, this key allows you to reclaim host ownership on any device.
              </DialogDescription>
            </DialogHeader>

            <div className="p-3 rounded border border-border bg-muted/30 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Emergency Room Recovery Key
              </span>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={recoveryToken}
                  className="h-8 font-mono text-xs bg-surface border-border select-all"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyRecovery}
                  className="h-8 px-3 text-xs gap-1 shrink-0 font-mono"
                >
                  {copiedToken ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                This token is never shown again. Keep it private.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                size="sm"
                variant="default"
                onClick={handleEnterRoom}
                className="h-8 px-4 text-xs font-semibold gap-1.5"
              >
                <span>Enter Room Stage</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          /* Creation Form */
          <>
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
                  {isSubmitting ? 'Creating...' : 'Launch Lounge'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
