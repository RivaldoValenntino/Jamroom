import { useState, useEffect } from 'react';
import {
  Users,
  ShieldAlert,
  Volume2,
  VolumeX,
  Crown,
  MoreVertical,
  UserX,
  UserCheck,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RoomMember, RoomRole } from '@/types/database.types';
import {
  getRoomMembers,
  updateMemberRole,
  kickMember,
  transferRoomOwnership,
} from '../services/roomService';

interface MemberRosterPanelProps {
  roomId: string;
  isHost: boolean;
  userRole: RoomRole;
  currentUserId: string | null;
  onOwnershipTransferred?: () => void;
}

export function MemberRosterPanel({
  roomId,
  isHost,
  userRole,
  currentUserId,
  onOwnershipTransferred,
}: MemberRosterPanelProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const data = await getRoomMembers(roomId);
      setMembers(data);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    // Poll member roster every 10 seconds for activity updates
    const interval = setInterval(fetchMembers, 10000);
    return () => clearInterval(interval);
  }, [roomId]);

  const handleRoleChange = async (targetUserId: string, newRole: RoomRole) => {
    setActionLoadingId(targetUserId);
    try {
      await updateMemberRole(roomId, targetUserId, newRole);
      await fetchMembers();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleKick = async (targetUserId: string) => {
    if (!window.confirm('Are you sure you want to kick this listener from the lounge?')) return;
    setActionLoadingId(targetUserId);
    try {
      await kickMember(roomId, targetUserId);
      await fetchMembers();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTransferHost = async (targetUserId: string, targetName: string) => {
    if (!window.confirm(`Transfer host control to ${targetName}? You will become a moderator.`)) return;
    setActionLoadingId(targetUserId);
    try {
      await transferRoomOwnership(roomId, targetUserId);
      await fetchMembers();
      if (onOwnershipTransferred) onOwnershipTransferred();
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper to check if member was active in last 60 seconds
  const isMemberActive = (lastActiveAt: string) => {
    const diffMs = Date.now() - new Date(lastActiveAt).getTime();
    return diffMs < 60000;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface/30">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
            Lounge Roster ({members.length})
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5">
          {members.filter((m) => isMemberActive(m.last_active_at)).length} Active
        </Badge>
      </div>

      {/* Member List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-xs font-mono text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            Loading listeners...
          </div>
        ) : members.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No enrolled members found.
          </div>
        ) : (
          members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const profile = member.profile;
            const displayName = profile?.display_name || (isSelf ? 'You (Guest)' : 'Guest Listener');
            const username = profile?.username ? `@${profile.username}` : `id:${member.user_id.slice(0, 6)}`;
            const avatarUrl = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${member.user_id}`;
            const active = isMemberActive(member.last_active_at);
            const isMemberHost = member.role === 'owner';
            const isMemberMod = member.role === 'moderator';

            const canManage = isHost && !isSelf;

            return (
              <div
                key={member.id}
                className="p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar with Status Pip */}
                  <div className="relative shrink-0">
                    <Avatar className="h-7 w-7 rounded border border-border">
                      <AvatarImage src={avatarUrl} alt={displayName} />
                      <AvatarFallback className="text-[10px] uppercase font-mono">
                        {displayName.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
                        active ? 'bg-emerald-500' : 'bg-zinc-500'
                      }`}
                      title={active ? 'Active' : 'Idle'}
                    />
                  </div>

                  {/* Identity */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-foreground truncate text-xs" title={displayName}>
                        {displayName}
                      </p>
                      {isSelf && (
                        <span className="text-[9px] font-mono text-muted-foreground">(You)</span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{username}</p>
                  </div>
                </div>

                {/* Badges & Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Role Badge */}
                  {isMemberHost ? (
                    <Badge variant="default" className="text-[9px] px-1 py-0 gap-0.5 bg-amber-500/20 text-amber-300 border-amber-500/30">
                      <Crown className="h-2.5 w-2.5" />
                      HOST
                    </Badge>
                  ) : isMemberMod ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-cyan-300 border-cyan-500/30">
                      MOD
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                      LISTENER
                    </Badge>
                  )}

                  {/* Audio Status */}
                  <div
                    className="p-1 text-muted-foreground"
                    title={active ? 'Synchronized Listening' : 'Muted / Inactive'}
                  >
                    {active ? (
                      <Volume2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <VolumeX className="h-3 w-3 text-zinc-500" />
                    )}
                  </div>

                  {/* Moderation Controls Dropdown */}
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground">
                          {actionLoadingId === member.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <MoreVertical className="h-3 w-3" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-surface border-border text-xs">
                        {isMemberMod ? (
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.user_id, 'member')}
                            className="gap-2 cursor-pointer"
                          >
                            <ShieldAlert className="h-3.5 w-3.5 text-zinc-400" />
                            <span>Demote to Listener</span>
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.user_id, 'moderator')}
                            className="gap-2 cursor-pointer"
                          >
                            <UserCheck className="h-3.5 w-3.5 text-cyan-400" />
                            <span>Promote to Mod</span>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                          onClick={() => handleTransferHost(member.user_id, displayName)}
                          className="gap-2 cursor-pointer text-amber-400"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span>Transfer Host</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator className="bg-border" />

                        <DropdownMenuItem
                          onClick={() => handleKick(member.user_id)}
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>Kick Listener</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Roster Footer Status */}
      <div className="px-3 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
        <span>Active listener heartbeats update every 30s</span>
        <span>Role: {userRole.toUpperCase()}</span>
      </div>
    </div>
  );
}
