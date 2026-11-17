import { useState, useEffect } from 'react';
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
import { useAuth } from '../hooks/useAuth';
import { Dices, Copy, Check, Download, Upload, Shield, User } from 'lucide-react';

const RANDOM_NAMES = [
  'VinylPulse',
  'BassDrift',
  'EchoWave',
  'BeatCraft',
  'LoFiSoul',
  'NeonGroove',
  'SonicShift',
  'SynthDrop',
  'AudioPilot',
  'SubZero',
  'GrooveLine',
  'TempoRider',
];

const AVATAR_SEEDS = ['apollo', 'groove', 'sonic', 'aurora', 'tempo', 'echo', 'pulse', 'orbit'];

export function GuestOnboardingModal() {
  const { profile, user, isOnboardingOpen, setIsOnboardingOpen, updateProfile, exportBackup, restoreBackup } =
    useAuth();

  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showBackupTool, setShowBackupTool] = useState(false);
  const [importString, setImportString] = useState('');
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync state when modal opens
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setSelectedAvatar(
        profile.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.id}`
      );
    }
  }, [profile, isOnboardingOpen]);

  const handleRandomize = () => {
    const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    setDisplayName(`${randomName}${randomSuffix}`);
  };

  const handleSelectSeed = (seed: string) => {
    setSelectedAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Display name is required');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await updateProfile(displayName.trim(), selectedAvatar);
      setIsOnboardingOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyId = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyBackup = () => {
    const token = exportBackup();
    navigator.clipboard.writeText(token);
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const handleRestore = () => {
    if (!importString.trim()) return;
    try {
      restoreBackup(importString.trim());
      setShowBackupTool(false);
      setImportString('');
      setIsOnboardingOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <Dialog open={isOnboardingOpen} onOpenChange={setIsOnboardingOpen}>
      <DialogContent className="max-w-md p-5 bg-surface border-border">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold text-foreground">
              Guest Profile & Identity
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              GUEST ONLY
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            No registration required. Your UUID identity persists automatically across sessions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMsg && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {errorMsg}
            </div>
          )}

          {/* Avatar Selector Row */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Avatar Icon
            </label>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded border border-border bg-muted p-0.5 shrink-0 overflow-hidden">
                {selectedAvatar ? (
                  <img src={selectedAvatar} alt="Selected" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-full w-full p-2 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1">
                {AVATAR_SEEDS.map((seed) => {
                  const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      type="button"
                      key={seed}
                      onClick={() => handleSelectSeed(seed)}
                      className={`h-8 w-8 rounded border p-0.5 shrink-0 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/20'
                          : 'border-border bg-surface hover:border-muted-foreground'
                      }`}
                    >
                      <img src={url} alt={seed} className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Display Name Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">
                Display Name
              </label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {displayName.length}/30
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Choose your lounge name..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 30))}
                className="h-9 text-xs bg-muted/40 border-border"
                maxLength={30}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRandomize}
                className="h-9 px-2.5 text-xs gap-1 shrink-0 font-medium"
                title="Randomize Music Pseudonym"
              >
                <Dices className="h-3.5 w-3.5" />
                <span>Random</span>
              </Button>
            </div>
          </div>

          {/* Persistent Identity & Backup Accordion */}
          <div className="border border-border/80 rounded p-2.5 bg-muted/20 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-mono">
                <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[190px]">UUID: {user?.id || 'Initializing...'}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyId}
                className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1"
                title="Copy Full UUID"
              >
                {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Safari / Cross-Device Token:</span>
              <button
                type="button"
                onClick={() => setShowBackupTool(!showBackupTool)}
                className="text-primary hover:underline font-medium text-[11px]"
              >
                {showBackupTool ? 'Hide Tools' : 'Backup / Restore'}
              </button>
            </div>

            {/* Backup / Restore Sub-Panel */}
            {showBackupTool && (
              <div className="mt-2.5 pt-2 border-t border-border/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">Export session string:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyBackup}
                    className="h-6 text-[10px] px-2 gap-1 font-mono"
                  >
                    {copiedBackup ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Download className="h-2.5 w-2.5" />}
                    <span>{copiedBackup ? 'Copied Token' : 'Copy Backup'}</span>
                  </Button>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <Input
                    placeholder="Paste backup string to restore..."
                    value={importString}
                    onChange={(e) => setImportString(e.target.value)}
                    className="h-6 text-[10px] font-mono bg-surface border-border"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRestore}
                    className="h-6 text-[10px] px-2 gap-1 shrink-0"
                  >
                    <Upload className="h-2.5 w-2.5" />
                    <span>Restore</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsOnboardingOpen(false)}
              className="h-8 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              className="h-8 px-4 text-xs font-semibold"
            >
              {isSubmitting ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
