# JAMROOM — Real-Time Systems Architecture (Audited & Hardened)

## 1. Multi-Tier Real-Time Topology

Real-time synchronization in JAMROOM is designed around **functional segregation**. Different types of data have drastically different delivery guarantees, frequencies, and persistence requirements:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE REALTIME ENGINE                        │
└───────┬────────────────────────────┬────────────────────────────┬──────┘
        │                            │                            │
        ▼                            ▼                            ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ 1. PRESENCE      │       │ 2. BROADCAST     │       │ 3. POSTGRES CDC  │
│ Online Roster    │       │ Ephemeral P2P    │       │ Persistent State │
│ Active Listeners │       │ Emoji Reactions  │       │ Queue Items      │
│ Audio-State Flag │       │ Typing Indicator │       │ Chat Messages    │
│ Low Frequency    │       │ Ultra-Low Latency│       │ Guaranteed Order │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## 2. Channel Responsibilities & Schemas

For each active room, a single consolidated Supabase Realtime channel is initialized:
`const channel = supabase.channel(`room:${roomId}`);`

### 2.1 Presence Tier (Member Roster & Active Listener Health)
Tracks who is currently inside the room, their role, and whether their audio is active.

- **Tracked Payload Schema**:
  ```typescript
  interface MemberPresenceState {
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    role: 'owner' | 'moderator' | 'member';
    is_audio_enabled: boolean;
    client_version: string;
    joined_at: string;
  }
  ```
- **Lifecycle Events**:
  - `sync`: Emitted whenever members join or leave; rebuilds the active roster in `useRoomStore`.
  - `join`: Member connects.
  - `leave`: Member tab closes or connection drops.

### 2.2 Server Heartbeat & Activity Sync
While Presence tracks real-time socket connections on the client, PostgreSQL requires a reliable, server-verifiable record of active members for server-side skip vote calculations:
- The client executes a lightweight heartbeat RPC (`rpc_touch_member_activity(roomId)`) every **30 seconds**.
- This updates `room_members.last_active_at = clock_timestamp()`.
- If a client disconnects, their heartbeat ceases, and within 45 seconds the server automatically drops them from the skip vote denominator.

### 2.3 Broadcast Tier (Ephemeral High-Frequency Events)
Used for non-persistent, ephemeral user interactions that should not hit the database.

| Event Name | Direction | Payload Example | Purpose |
| :--- | :--- | :--- | :--- |
| `reaction:send` | Client -> Room | `{ emoji: '🔥', x: 0.45, y: 0.82 }` | Floating animated reactions over video |
| `user:typing` | Client -> Room | `{ user_id: 'uuid', name: 'Sam' }` | Live typing indicator in chat |
| `playback:optimistic_seek` | DJ -> Room | `{ position_seconds: 78.4 }` | Instant visual seek bar feedback |

### 2.4 PostgreSQL Changes Tier (Change Data Capture - CDC)
Listens strictly to validated database changes published via PostgreSQL Write-Ahead Log (WAL).

| Table | CDC Filter | Event Handled | Client Action |
| :--- | :--- | :--- | :--- |
| `playback_states` | `room_id=eq.${roomId}` | `UPDATE` | Pass new authoritative state to `usePlaybackSync` |
| `queue_items` | `room_id=eq.${roomId}` | `INSERT`, `UPDATE`, `DELETE` | Invalidate TanStack Query cache for queue list |
| `messages` | `room_id=eq.${roomId}` | `INSERT`, `DELETE` | Append new chat message or remove moderated text |
| `skip_votes` | `room_id=eq.${roomId}` | `INSERT`, `DELETE` | Refresh active skip vote progress bar |
| `rooms` | `id=eq.${roomId}` | `UPDATE` | Update active room settings / title / privacy |

---

## 3. Reconnection Synchronization Protocol

### 3.1 The Missed-Event Vulnerability
Supabase Realtime CDC over WebSockets does **not** provide message replay or an offset cursor for clients reconnecting after a 10–30 second network blip or laptop lid closure. Any track transition or queue update during the offline window would be permanently missed.

### 3.2 Formal Reconnection Recovery Protocol
Whenever the Realtime channel changes status from `DISCONNECTED`/`RECONNECTING` to `SUBSCRIBED` (or when `document.visibilitychange` fires):
1. **Force REST Hydration**: TanStack Query immediately fires background queries:
   - `GET /rest/v1/playback_states?room_id=eq.${roomId}`
   - `GET /rest/v1/queue_items?room_id=eq.${roomId}&status=in.(queued,playing)&order=position.asc`
2. **Version Reconciliation**:
   ```typescript
   if (restState.playback_version > localState.playback_version) {
     console.log(`[SyncEngine] Recovering missed state v${restState.playback_version}`);
     syncEngine.applyAuthoritativeState(restState);
   }
   ```
3. **Immediate Drift Correction**: The sync engine immediately compares current player time with the newly hydrated state and applies drift correction.

---

## 4. Hardened Hook Architecture: `useRoomRealtime`

```typescript
// hooks/useRoomRealtime.ts
import { useEffect, useRef } from 'react';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRoomStore } from '@/stores/useRoomStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useQueryClient } from '@tanstack/react-query';

export function useRoomRealtime(roomId: string) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isAudioEnabled = usePlayerStore((s) => s.isAudioEnabled);
  const setPlaybackState = usePlayerStore((s) => s.setAuthoritativeState);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!roomId || !user) return;

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: user.id } },
    });

    // 1. Setup Presence
    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        useRoomStore.getState().setOnlineMembers(presenceState);
      });

    // 2. Setup Broadcast
    channel.on('broadcast', { event: 'reaction:send' }, ({ payload }) => {
      useRoomStore.getState().triggerFloatingReaction(payload);
    });

    // 3. Setup Postgres CDC
    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playback_states', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setPlaybackState(payload.new as any);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['queue', roomId] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          useRoomStore.getState().appendMessage(payload.new as any);
        }
      );

    // 4. Handle Subscription Lifecycle & Reconnects
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track presence
        await channel.track({
          user_id: user.id,
          display_name: profile?.display_name || 'Guest',
          avatar_url: profile?.avatar_url || '',
          role: useRoomStore.getState().currentUserRole,
          is_audio_enabled: isAudioEnabled,
          joined_at: new Date().toISOString(),
        });

        // Trigger REST hydration to catch up on any missed offline events
        queryClient.invalidateQueries({ queryKey: ['playback_state', roomId] });
        queryClient.invalidateQueries({ queryKey: ['queue', roomId] });
      }
    });

    // 5. Periodic Activity Heartbeat (Every 30s)
    heartbeatTimer.current = setInterval(async () => {
      await supabase.rpc('rpc_touch_member_activity', { p_room_id: roomId });
    }, 30_000);

    // Initial immediate heartbeat
    supabase.rpc('rpc_touch_member_activity', { p_room_id: roomId });

    // Clean teardown on unmount (prevents StrictMode socket leaks)
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      channel.unsubscribe();
    };
  }, [roomId, user?.id, isAudioEnabled]);
}
```
