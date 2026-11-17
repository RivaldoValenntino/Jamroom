import { useState } from 'react';
import { Settings, Shield, Sliders, MessageSquare, Loader2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import type { Room, RoomSettings } from '@/types/database.types';
import { updateRoom } from '../services/roomService';

interface RoomSettingsModalProps {
  isOpen: boolean;
  room: Room;
  isHost: boolean;
  onClose: () => void;
  onRoomUpdated: (updated: Room) => void;
}

export function RoomSettingsModal({
  isOpen,
  room,
  isHost,
  onClose,
  onRoomUpdated,
}: RoomSettingsModalProps) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description || '');
  const [settings, setSettings] = useState<RoomSettings>({
    shared_speakers: room.settings?.shared_speakers ?? false,
    add_to_queue_permission: room.settings?.add_to_queue_permission ?? 'anyone',
    reorder_queue_permission: room.settings?.reorder_queue_permission ?? 'host_and_mods_only',
    delete_queue_permission: room.settings?.delete_queue_permission ?? 'host_and_mods_only',
    vote_skip_enabled: room.settings?.vote_skip_enabled ?? true,
    skip_vote_threshold_percent: room.settings?.skip_vote_threshold_percent ?? 50,
    max_queue_items_per_user: room.settings?.max_queue_items_per_user ?? 5,
    chat_enabled: room.settings?.chat_enabled ?? true,
    auto_play_on_queue_add: room.settings?.auto_play_on_queue_add ?? true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const updated = await updateRoom(room.id, {
        name: name.trim(),
        description: description.trim() || null,
        settings,
      });

      onRoomUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update settings. Verify your host/mod permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl bg-surface border-border p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="p-4 pb-3 border-b border-border text-left">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Lounge Settings
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Configure playback synchronization permissions, skip voting, and chat controls.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded border border-destructive/40 bg-destructive/10 text-destructive text-xs">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Room Details */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              General Information
            </h4>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Lounge Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                className="h-8 text-xs bg-muted/30 border-border"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Topic / Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's spinning in this room?"
                maxLength={160}
                className="h-8 text-xs bg-muted/30 border-border"
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Section 2: Playback Mode (Shared Speakers) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-primary" />
                  Playback Authority Mode
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Choose who controls playback commands (play, pause, seek).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, shared_speakers: false }))}
                className={`p-2.5 rounded border text-left transition-colors ${
                  !settings.shared_speakers
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border bg-surface text-muted-foreground hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">DJ Mode</span>
                  {!settings.shared_speakers && <Badge variant="default" className="text-[8px] py-0 px-1">ACTIVE</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground font-normal leading-snug">
                  Only the Host and appointed Moderators can pause, resume, or seek.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, shared_speakers: true }))}
                className={`p-2.5 rounded border text-left transition-colors ${
                  settings.shared_speakers
                    ? 'border-primary bg-primary/10 text-foreground font-semibold'
                    : 'border-border bg-surface text-muted-foreground hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Party Mode</span>
                  {settings.shared_speakers && <Badge variant="default" className="text-[8px] py-0 px-1">ACTIVE</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground font-normal leading-snug">
                  Shared speakers: any connected listener can play, pause, or seek.
                </p>
              </button>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Section 3: Collaborative Queue Permissions */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sliders className="h-3 w-3 text-primary" />
              Queue & Skip Rules
            </h4>

            <div className="flex items-center justify-between text-xs">
              <div>
                <p className="font-medium text-foreground">Who can add songs to queue?</p>
                <p className="text-[10px] text-muted-foreground">Restrict track submissions to vetted curators</p>
              </div>
              <select
                value={settings.add_to_queue_permission}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    add_to_queue_permission: e.target.value as 'anyone' | 'host_and_mods_only',
                  }))
                }
                className="bg-muted/40 border border-border text-foreground rounded text-xs px-2 py-1 focus:outline-none"
              >
                <option value="anyone">Everyone (Open)</option>
                <option value="host_and_mods_only">Host & Mods Only</option>
              </select>
            </div>

            {/* Who can delete songs directly */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
              <div>
                <p className="font-medium text-foreground">Who can delete songs from queue?</p>
                <p className="text-[10px] text-muted-foreground">Otoritas tertinggi ruang untuk menghapus lagu seketika</p>
              </div>
              <select
                value={settings.delete_queue_permission ?? 'host_and_mods_only'}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    delete_queue_permission: e.target.value as 'host_only' | 'host_and_mods_only' | 'anyone',
                  }))
                }
                className="bg-muted/40 border border-border text-foreground rounded text-xs px-2 py-1 focus:outline-none"
              >
                <option value="host_only">Host Only (Strict)</option>
                <option value="host_and_mods_only">Host & Mods Only (Recommended)</option>
                <option value="anyone">Everyone (Open)</option>
              </select>
            </div>

            {/* Skip Voting Slider */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-foreground">Democratic Skip Voting</p>
                  <p className="text-[10px] text-muted-foreground">
                    Required active member votes to automatically skip track
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {settings.skip_vote_threshold_percent}%
                </Badge>
              </div>

              <Slider
                value={[settings.skip_vote_threshold_percent]}
                onValueChange={(val) =>
                  setSettings((s) => ({ ...s, skip_vote_threshold_percent: val[0] }))
                }
                min={20}
                max={100}
                step={5}
                className="py-1"
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Section 4: Chat Toggle */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Enable Live Chat</p>
                <p className="text-[10px] text-muted-foreground">Allow room listeners to post messages</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.chat_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, chat_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-border bg-muted/40 text-primary accent-primary cursor-pointer"
            />
          </div>

          {/* Host Exclusive Notice */}
          {isHost && (
            <div className="p-3 rounded border border-border bg-muted/20 text-[11px] text-muted-foreground space-y-1">
              <p className="font-bold text-foreground uppercase tracking-wider text-[10px]">Host Authority</p>
              <p>
                As lounge creator, you retain emergency recovery rights and can promote moderators or transfer room ownership from the People tab.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs px-3">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="default"
              disabled={isSaving}
              className="h-7 text-xs px-3 font-semibold"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400 mr-1" />
                  Saved
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
