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
  Trash2,
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
import type { PresenceMember } from '@/features/social/hooks/useRoomPresence';
import {
  getRoomMembers,
  updateMemberRole,
  kickMember,
  transferRoomOwnership,
  cleanupInactiveMembers,
} from '../services/roomService';

interface MemberRosterPanelProps {
  roomId: string;
  isHost: boolean;
  userRole: RoomRole;
  currentUserId: string | null;
  onlineMembers?: PresenceMember[];
  onOwnershipTransferred?: () => void;
  kickedUserId?: string | null;
}

export function MemberRosterPanel({
  roomId,
  isHost,
  userRole,
  currentUserId,
  onlineMembers = [],
  onOwnershipTransferred,
  kickedUserId,
}: MemberRosterPanelProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'active' | 'all'>('active');
  const [isCleaning, setIsCleaning] = useState(false);

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

  // Remove kicked user in real-time when broadcast event arrives
  useEffect(() => {
    if (kickedUserId) {
      setMembers((prev) => prev.filter((m) => m.user_id !== kickedUserId));
    }
  }, [kickedUserId]);

  const handleRoleChange = async (targetUserId: string, newRole: RoomRole) => {
    setActionLoadingId(targetUserId);
    try {
      await updateMemberRole(roomId, targetUserId, newRole);
      await fetchMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to update member role');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleKick = async (targetUserId: string, targetName: string) => {
    if (!window.confirm(`Kick ${targetName} from the lounge?`)) return;
    setActionLoadingId(targetUserId);

    // Optimistic UI update
    const prevMembers = [...members];
    setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));

    try {
      await kickMember(roomId, targetUserId);
    } catch (err: any) {
      console.error('[handleKick] Kick error:', err);
      // Revert optimistic removal if database rejected
      setMembers(prevMembers);
      alert(err.message || 'Failed to kick listener. Check database permissions.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClearInactive = async () => {
    const inactiveList = members.filter((m) => !isMemberOnline(m));
    if (inactiveList.length === 0) return;

    if (!window.confirm(`Remove all ${inactiveList.length} inactive / disconnected listeners?`)) return;

    setIsCleaning(true);
    const prevMembers = [...members];
    setMembers((prev) => prev.filter((m) => isMemberOnline(m)));

    try {
      await cleanupInactiveMembers(roomId, 60);
      await fetchMembers();
    } catch (err: any) {
      console.error('[handleClearInactive] error:', err);
      setMembers(prevMembers);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleTransferHost = async (targetUserId: string, targetName: string) => {
    if (!window.confirm(`Transfer host control to ${targetName}? You will become a moderator.`)) return;
    setActionLoadingId(targetUserId);
    try {
      await transferRoomOwnership(roomId, targetUserId);
      await fetchMembers();
      if (onOwnershipTransferred) onOwnershipTransferred();
    } catch (err: any) {
      alert(err.message || 'Failed to transfer ownership');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Online status: Realtime Presence WebSocket has highest precedence, fallback to 60s ping
  const isMemberOnline = (member: RoomMember) => {
    if (member.user_id === currentUserId) return true;
    if (onlineMembers && onlineMembers.length > 0) {
      return onlineMembers.some((om) => om.user_id === member.user_id);
    }
    const diffMs = Date.now() - new Date(member.last_active_at).getTime();
    return diffMs < 60000;
  };

  const activeMembers = members.filter((m) => isMemberOnline(m));
  const inactiveMembers = members.filter((m) => !isMemberOnline(m));
  const activeCount = activeMembers.length;
  const inactiveCount = inactiveMembers.length;

  // Filtered members list
  const displayedMembers = (
    filterMode === 'active'
      ? activeMembers
      : [...activeMembers, ...inactiveMembers]
  );

  const canManage = isHost || userRole === 'moderator';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface/30">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-border flex flex-col gap-2 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
              Lounge Roster
            </span>
          </div>

          {/* Filter Mode Toggle Pills */}
          <div className="flex items-center bg-background/80 rounded border border-border p-0.5 text-[10px] font-mono">
            <button
              onClick={() => setFilterMode('active')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterMode === 'active'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterMode === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({members.length})
            </button>
          </div>
        </div>

        {/* Inactive Cleanup Bar (Visible to Host/Mod when disconnected guests exist) */}
        {canManage && inactiveCount > 0 && (
          <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-[11px]">
            <span className="text-zinc-400 font-mono text-[10px]">
              {inactiveCount} offline guest{inactiveCount > 1 ? 's' : ''} from closed tabs
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={isCleaning}
              onClick={handleClearInactive}
              className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10 font-mono gap-1"
            >
              {isCleaning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
              Clear Offline
            </Button>
          </div>
        )}
      </div>

      {/* Member List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-xs font-mono text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            Loading listeners...
          </div>
        ) : displayedMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
            <Users className="h-6 w-6 opacity-40 mb-1" />
            <p>No {filterMode === 'active' ? 'active' : ''} listeners found.</p>
            {filterMode === 'active' && inactiveCount > 0 && (
              <button
                onClick={() => setFilterMode('all')}
                className="text-primary hover:underline text-[11px] font-mono mt-1"
              >
                View {inactiveCount} offline listener{inactiveCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
        ) : (
          displayedMembers.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const profile = member.profile;
            const displayName = profile?.display_name || (isSelf ? 'You (Guest)' : 'Guest Listener');
            const username = profile?.username ? `@${profile.username}` : `id:${member.user_id.slice(0, 6)}`;
            const avatarUrl = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${member.user_id}`;
            const online = isMemberOnline(member);
            const isMemberHost = member.role === 'owner';
            const isMemberMod = member.role === 'moderator';

            const canManageThisUser = canManage && !isSelf && !isMemberHost;

            return (
              <div
                key={member.id}
                className={`p-2 rounded border border-border bg-surface hover:bg-surface-hover flex items-center justify-between text-xs transition-colors ${
                  !online ? 'opacity-65' : ''
                }`}
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
                        online ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                      title={online ? 'Online' : 'Disconnected / Offline'}
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
                  {/* Online / Offline / Role Badges */}
                  {isMemberHost ? (
                    <Badge variant="default" className="text-[9px] px-1 py-0 gap-0.5 bg-amber-500/20 text-amber-300 border-amber-500/30">
                      <Crown className="h-2.5 w-2.5" />
                      HOST
                    </Badge>
                  ) : isMemberMod ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-cyan-300 border-cyan-500/30">
                      MOD
                    </Badge>
                  ) : !online ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-zinc-500 border-zinc-800 bg-zinc-900/60 font-mono">
                      OFFLINE
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                      LISTENER
                    </Badge>
                  )}

                  {/* Audio Status */}
                  <div
                    className="p-1 text-muted-foreground"
                    title={online ? 'Synchronized Audio' : 'Disconnected'}
                  >
                    {online ? (
                      <Volume2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <VolumeX className="h-3 w-3 text-zinc-600" />
                    )}
                  </div>

                  {/* Moderation Controls */}
                  {canManageThisUser && (
                    <div className="flex items-center gap-0.5">
                      {/* Direct Quick Kick for offline listeners */}
                      {!online && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleKick(member.user_id, displayName)}
                          className="h-6 w-6 text-zinc-500 hover:text-destructive"
                          title="Remove offline listener"
                        >
                          {actionLoadingId === member.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <UserX className="h-3 w-3" />
                          )}
                        </Button>
                      )}

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

                          {isHost && (
                            <DropdownMenuItem
                              onClick={() => handleTransferHost(member.user_id, displayName)}
                              className="gap-2 cursor-pointer text-amber-400"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              <span>Transfer Host</span>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator className="bg-border" />

                          <DropdownMenuItem
                            onClick={() => handleKick(member.user_id, displayName)}
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>Kick Listener</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Roster Footer Status */}
      <div className="px-3 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
        <span>Presence sync: WebSocket</span>
        <span>Role: {userRole.toUpperCase()}</span>
      </div>
    </div>
  );
}
