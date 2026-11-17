import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, ShieldAlert, Check, Copy } from 'lucide-react';

interface RoomRecoveryModalProps {
  isOpen: boolean;
  roomName: string;
  onClaim: (token: string) => Promise<{ success: boolean; newRecoveryToken: string }>;
  onClose: () => void;
}

export function RoomRecoveryModal({
  isOpen,
  roomName,
  onClaim,
  onClose,
}: RoomRecoveryModalProps) {
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const [copiedNewToken, setCopiedNewToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const res = await onClaim(token.trim());
      setRotatedToken(res.newRecoveryToken);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid recovery key or recovery locked');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyNewToken = () => {
    if (!rotatedToken) return;
    navigator.clipboard.writeText(rotatedToken);
    setCopiedNewToken(true);
    setTimeout(() => setCopiedNewToken(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-5 bg-surface border-border">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-bold text-foreground">
              Recover Room Ownership
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            Reclaim host control of {roomName} from another browser or device.
          </DialogDescription>
        </DialogHeader>

        {rotatedToken ? (
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 flex flex-col gap-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Ownership Successfully Claimed!
              </span>
              <p className="text-[11px] text-muted-foreground">
                Your previous recovery token has been invalidated. Save your new rotated key below:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={rotatedToken}
                className="h-8 font-mono text-xs bg-muted/60 border-border select-all"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyNewToken}
                className="h-8 px-3 text-xs gap-1 shrink-0 font-mono"
              >
                {copiedNewToken ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedNewToken ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button size="sm" variant="default" onClick={onClose} className="h-7 px-4 text-xs">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
            {errorMsg && (
              <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                {errorMsg}
              </div>
            )}

            <div className="p-2.5 rounded border border-border bg-muted/30 text-xs text-muted-foreground flex gap-2">
              <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] leading-tight">
                Enter the emergency recovery key generated when this room was created. Max 5 attempts before a 1-hour lockout.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Emergency Recovery Key
              </label>
              <Input
                placeholder="jam-xxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="h-8 text-xs font-mono bg-muted/40 border-border"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 text-xs font-medium"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isSubmitting}
                className="h-7 px-3 text-xs font-semibold"
              >
                {isSubmitting ? 'Verifying...' : 'Claim Ownership'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
