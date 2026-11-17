import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  ListMusic,
  Share2,
  Settings,
  KeyRound,
  Check,
  Radio,
  Play,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useRoom } from '@/features/room/hooks/useRoom';
import { useRoomQueue } from '@/features/room/hooks/useRoomQueue';
import { useLiveChat } from '@/features/social/hooks/useLiveChat';
import { useRoomPresence } from '@/features/social/hooks/useRoomPresence';
import { useFloatingReactions } from '@/features/social/hooks/useFloatingReactions';
import { FloatingReactions } from '@/features/social/components/FloatingReactions';
import { useAuthStore } from '@/stores/useAuthStore';
import { PasscodeModal } from '@/components/room/PasscodeModal';
import { RoomRecoveryModal } from '@/components/room/RoomRecoveryModal';
import { RoomSettingsModal } from '@/features/room/components/RoomSettingsModal';
import { MemberRosterPanel } from '@/features/room/components/MemberRosterPanel';
import { QueuePanel } from '@/features/room/components/QueuePanel';
import { NowPlayingStage } from '@/features/player/components/NowPlayingStage';
import { MusicSearchModal } from '@/features/player/components/MusicSearchModal';
import { PlaylistModal } from '@/features/playlist/components/PlaylistModal';
import { RoomHistoryModal } from '@/features/playlist/components/RoomHistoryModal';
import type { Room } from '@/types/database.types';

export function RoomPage() {
  const { slugOrId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Phase 3 Room Hook
  const {
    room,
    isLoading: isRoomLoading,
    isHost,
    userRole,
    isPasscodeRequired,
    passcodeError,
    submitPasscode,
    claimOwnership,
  } = useRoom(slugOrId);

  // Phase 5 & 6 Collaborative Queue & Playback Hook
  const {
    currentQueueItem,
    currentSong,
    upcomingQueue,
    playbackState,
    isPlaying,
    positionSeconds,
    syncStatus,
    skipVotesCount,
    skipVotesRequired,
    hasVotedToSkip,
    addSong,
    removeSong,
    moveSong,
    togglePlay,
    nextTrack,
    seek,
    voteSkip,
  } = useRoomQueue(room?.id);

  // UI Modal & Tab States
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'chat' | 'members'>('player');
  const [rightSidebarTab, setRightSidebarTab] = useState<'chat' | 'members'>('chat');
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeRoomState, setActiveRoomState] = useState<Room | null>(null);

  // Handle local state update when room settings change
  const currentRoom = activeRoomState || room;

  // Phase 8 Social: Real-Time Chat, Presence & Floating Reactions
  const { messages: liveChatMessages, sendMessage: sendChatMessage, messagesEndRef } = useLiveChat(currentRoom?.id);
  const { onlineCount } = useRoomPresence({
    roomId: currentRoom?.id,
    userRole,
    isPlaying,
  });
  const { reactions, sendReaction } = useFloatingReactions(currentRoom?.id);

  const [chatInput, setChatInput] = useState('');

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    setChatInput('');
    await sendChatMessage(trimmed);
  };

  if (isRoomLoading) {
    return (
      <div className="flex h-[calc(100vh-3.25rem)] items-center justify-center bg-background text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span>Synchronizing lounge state...</span>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="flex h-[calc(100vh-3.25rem)] flex-col items-center justify-center bg-background p-4 text-center">
        <Radio className="h-8 w-8 text-muted-foreground mb-3 opacity-60" />
        <h2 className="text-base font-bold text-foreground mb-1">Lounge Not Found</h2>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          The room "{slugOrId}" does not exist, has ended, or was archived.
        </p>
        <Link to="/explore">
          <Button size="sm" variant="default" className="text-xs">
            Browse Live Directory
          </Button>
        </Link>
      </div>
    );
  }

  // Playback & Queue Permission evaluation
  const isPartyMode = currentRoom.settings?.shared_speakers === true;
  const canControlPlayback = isHost || userRole === 'moderator' || isPartyMode;
  const canAddSong =
    currentRoom.settings?.add_to_queue_permission === 'anyone' ||
    isHost ||
    userRole === 'moderator';
  const canManageQueue =
    currentRoom.settings?.reorder_queue_permission === 'anyone' ||
    isHost ||
    userRole === 'moderator';

  // Deletion permission hierarchy (Host authority)
  const deletePermission = currentRoom.settings?.delete_queue_permission || 'host_and_mods_only';
  const canDeleteCurrentSong =
    isHost ||
    (deletePermission === 'host_and_mods_only' &&
      (userRole === 'moderator' || (user?.id && currentQueueItem?.added_by === user.id))) ||
    deletePermission === 'anyone';

  const handleDeleteCurrentSong = () => {
    if (currentQueueItem) {
      removeSong(currentQueueItem.id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.25rem)] flex-col bg-background overflow-hidden relative">
      {/* Passcode Modal Overlay */}
      {isPasscodeRequired && (
        <PasscodeModal
          isOpen={isPasscodeRequired}
          roomName={currentRoom.name}
          error={passcodeError}
          onSubmit={submitPasscode}
          onCancel={() => navigate('/explore')}
        />
      )}

      {/* Room Host Emergency Recovery Modal */}
      <RoomRecoveryModal
        isOpen={isRecoveryOpen}
        roomName={currentRoom.name}
        onClaim={claimOwnership}
        onClose={() => setIsRecoveryOpen(false)}
      />

      {/* Room Settings Modal */}
      <RoomSettingsModal
        isOpen={isSettingsOpen}
        room={currentRoom}
        isHost={isHost}
        onClose={() => setIsSettingsOpen(false)}
        onRoomUpdated={(updated) => setActiveRoomState(updated)}
      />

      {/* Music Search & Queue Modal */}
      <MusicSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddSong={addSong}
      />

      {/* Personal Playlists Modal */}
      <PlaylistModal
        isOpen={isPlaylistOpen}
        roomId={currentRoom.id}
        onClose={() => setIsPlaylistOpen(false)}
        onImportComplete={() => {
          setIsPlaylistOpen(false);
        }}
      />

      {/* Room Playback History Modal */}
      <RoomHistoryModal
        isOpen={isHistoryOpen}
        roomId={currentRoom.id}
        onClose={() => setIsHistoryOpen(false)}
        onRequeue={addSong}
      />

      {/* Studio Stage Top Bar */}
      <header className="h-10 border-b border-border bg-surface/50 px-3 sm:px-4 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2.5 truncate">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-foreground text-xs uppercase tracking-wider truncate">
            {currentRoom.name}
          </span>
          <span className="text-muted-foreground hidden sm:inline">•</span>
          <Badge
            variant={isHost ? 'default' : 'outline'}
            className="text-[10px] hidden sm:inline-flex py-0 px-1.5 font-mono"
          >
            {isHost ? 'YOU ARE HOST' : userRole === 'moderator' ? 'MODERATOR' : 'LISTENER'}
          </Badge>
          <span className="text-[11px] font-mono text-muted-foreground hidden md:inline">
            {isPartyMode ? 'PARTY MODE (SHARED SPEAKERS)' : 'DJ MODE (HOST ONLY)'}
          </span>
          <span className="text-muted-foreground hidden lg:inline">•</span>
          <Badge variant="outline" className="text-[10px] hidden lg:inline-flex py-0 px-1.5 font-mono">
            {onlineCount} ONLINE
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {!isHost && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsRecoveryOpen(true)}
              className="h-6 gap-1 text-[11px] px-2 text-muted-foreground hover:text-foreground font-mono"
              title="Claim host control with emergency recovery key"
            >
              <KeyRound className="h-3 w-3" />
              <span className="hidden md:inline">Claim Host</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="h-6 gap-1 text-[11px] px-2 font-medium"
          >
            {copiedLink ? <Check className="h-3 w-3 text-emerald-400" /> : <Share2 className="h-3 w-3" />}
            <span>{copiedLink ? 'Copied' : 'Invite'}</span>
          </Button>

          {(isHost || userRole === 'moderator') && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsSettingsOpen(true)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Room Settings"
            >
              <Settings className="h-3 w-3" />
            </Button>
          )}
        </div>
      </header>

      {/* Main Responsive 3-Column Studio Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: Collaborative Queue */}
        <section
          className={`lg:col-span-3 border-r border-border bg-surface/30 flex flex-col h-full overflow-hidden ${
            activeTab === 'queue' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          <QueuePanel
            currentQueueItem={currentQueueItem}
            upcomingQueue={upcomingQueue}
            canAddSong={canAddSong}
            canManageQueue={canManageQueue}
            userRole={isHost ? 'owner' : userRole}
            deleteQueuePermission={deletePermission}
            currentUserId={user?.id || null}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenPlaylists={() => setIsPlaylistOpen(true)}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onRemoveItem={removeSong}
            onMoveItem={moveSong}
          />
        </section>

        {/* CENTER STAGE: Synchronized YouTube Player & Controls */}
        <section
          className={`lg:col-span-6 flex flex-col justify-between overflow-y-auto ${
            activeTab === 'player' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          <NowPlayingStage
            currentSong={currentSong}
            playbackState={playbackState}
            isPlaying={isPlaying}
            positionSeconds={positionSeconds}
            syncStatus={syncStatus}
            canControlPlayback={canControlPlayback}
            canDeleteSong={canDeleteCurrentSong}
            onDeleteCurrentSong={handleDeleteCurrentSong}
            skipVotesCount={skipVotesCount}
            skipVotesRequired={skipVotesRequired}
            hasVotedToSkip={hasVotedToSkip}
            onTogglePlay={togglePlay}
            onNextTrack={nextTrack}
            onVoteSkip={voteSkip}
            onSeek={seek}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
          <div className="px-4 pb-2 flex justify-center">
            <FloatingReactions
              reactions={reactions}
              onSendReaction={sendReaction}
            />
          </div>
        </section>

        {/* RIGHT COLUMN: Live Chat & Presence Roster */}
        <section
          className={`lg:col-span-3 border-l border-border bg-surface/30 flex flex-col h-full overflow-hidden ${
            activeTab === 'chat' || activeTab === 'members' ? 'flex col-span-12' : 'hidden lg:flex'
          }`}
        >
          {/* Header with Switcher Tabs */}
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded border border-border">
              <button
                type="button"
                onClick={() => setRightSidebarTab('chat')}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded flex items-center gap-1 transition-colors ${
                  rightSidebarTab === 'chat'
                    ? 'bg-surface text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare className="h-3 w-3" />
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setRightSidebarTab('members')}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded flex items-center gap-1 transition-colors ${
                  rightSidebarTab === 'members'
                    ? 'bg-surface text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Users className="h-3 w-3" />
                <span>People</span>
              </button>
            </div>

            <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE</span>
            </div>
          </div>

          {/* Right Sidebar Body */}
          {rightSidebarTab === 'chat' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Chat Stream */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
                {liveChatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground p-4">
                    <MessageSquare className="h-6 w-6 mb-2 opacity-30" />
                    <p>No messages yet.</p>
                    <p className="text-[10px] mt-0.5">Say hello to other listeners in this lounge!</p>
                  </div>
                ) : (
                  liveChatMessages.map((msg) => {
                    const isSelf = user?.id && msg.user_id === user.id;
                    const senderName = msg.profile?.display_name || (isSelf ? 'You' : 'Listener');
                    const formattedTime = new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div key={msg.id} className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className={`font-semibold ${isSelf ? 'text-primary' : 'text-foreground'}`}>
                            {senderName}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                            {formattedTime}
                          </span>
                        </div>
                        <p className="text-foreground text-xs bg-surface p-2 rounded border border-border leading-snug">
                          {msg.content}
                        </p>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-2 border-t border-border bg-surface flex items-center gap-1.5">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message listeners..."
                  className="h-7 text-xs bg-muted/40 border-border rounded"
                />
                <Button type="submit" size="sm" variant="default" className="h-7 px-2.5 text-xs font-semibold">
                  <Send className="h-3 w-3" />
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <MemberRosterPanel
                roomId={currentRoom.id}
                isHost={isHost}
                userRole={userRole}
                currentUserId={user?.id || null}
              />
            </div>
          )}
        </section>
      </div>

      {/* MOBILE BOTTOM TABS */}
      <nav className="lg:hidden h-12 border-t border-border bg-surface flex items-center justify-around px-2 shrink-0">
        <button
          onClick={() => setActiveTab('player')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'player' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Play className="h-3.5 w-3.5 mb-0.5" />
          <span>Stage</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'queue' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <ListMusic className="h-3.5 w-3.5 mb-0.5" />
          <span>Queue ({upcomingQueue.length + (currentQueueItem ? 1 : 0)})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('chat');
            setRightSidebarTab('chat');
          }}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 mb-0.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('members');
            setRightSidebarTab('members');
          }}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-3 ${
            activeTab === 'members' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="h-3.5 w-3.5 mb-0.5" />
          <span>People</span>
        </button>
      </nav>
    </div>
  );
}
