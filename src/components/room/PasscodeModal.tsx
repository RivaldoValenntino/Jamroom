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
import { Lock, ArrowRight } from 'lucide-react';

interface PasscodeModalProps {
  isOpen: boolean;
  roomName: string;
  error?: string | null;
  onSubmit: (passcode: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasscodeModal({
  isOpen,
  roomName,
  error,
  onSubmit,
  onCancel,
}: PasscodeModalProps) {
  const [passcode, setPasscode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setIsSubmitting(true);
    await onSubmit(passcode.trim());
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm p-5 bg-surface border-border">
        <DialogHeader className="space-y-1 text-left pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-400" />
            <DialogTitle className="text-sm font-bold text-foreground">
              Passcode Protected Lounge
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            {roomName} requires a password to listen and participate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
          {error && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Room Password
            </label>
            <Input
              type="password"
              placeholder="Enter room password..."
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="h-8 text-xs font-mono bg-muted/40 border-border"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-7 text-xs font-medium"
            >
              Exit
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              className="h-7 px-3 text-xs font-semibold gap-1"
            >
              <span>Unlock Room</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
