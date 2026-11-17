# JAMROOM — Room Permission Matrix & Authorization Engine (Audited & Hardened)

## 1. Role Definitions & Hierarchy

JAMROOM uses a hierarchical Role-Based Access Control (RBAC) model per room. Roles are scoped specifically to the `room_members` table and validated on the backend.

```
       ┌────────────────────────┐
       │         OWNER          │  Full administrative control, transfer, settings, destructive ops
       └───────────┬────────────┘
                   │ inherits
       ┌───────────▼────────────┐
       │       MODERATOR        │  Queue curation, chat moderation, kick members
       └───────────┬────────────┘
                   │ inherits
       ┌───────────▼────────────┐
       │         MEMBER         │  Listening, adding songs (if permitted), voting, chatting
       └────────────────────────┘
```

1. **Owner (`owner`)**:
   - The creator of the room (or designated recipient of ownership transfer).
   - Has absolute authority over room settings, permissions, role assignments, and room lifecycle.
   - Immune to kicks, mutes, or demotions.
2. **Moderator (`moderator`)**:
   - Elevated trusted member designated by the Owner.
   - Assists in curating the queue, skipping tracks, moderating chat messages, and removing disruptive participants.
   - Cannot kick or mute other Moderators or the Owner.
3. **Member (`member`)**:
   - Any guest who has joined the room (and provided a valid passcode if protected).
   - Participates in social chat, casts skip votes, and adds songs according to the room's active permission settings.

---

## 2. Granular Operations & Permission Matrix

The table below defines authorization requirements for every user action. Permission checks are executed inside PostgreSQL stored procedures via `auth.uid()`.

| Operation | Owner | Moderator | Member | Applicable Room Setting Condition |
| :--- | :---: | :---: | :---: | :--- |
| **Play / Pause / Resume** | ✅ | ✅ | ⚠️ | Permitted for Member **only if** `settings.shared_speakers == true` |
| **Seek Playback Position** | ✅ | ✅ | ⚠️ | Permitted for Member **only if** `settings.shared_speakers == true` |
| **Instant Skip Song** | ✅ | ✅ | ❌ | Bypasses skip voting; immediately advances queue |
| **Vote to Skip Song** | ✅ | ✅ | ✅ | When `settings.vote_skip_enabled == true` |
| **Add Song to Queue** | ✅ | ✅ | ⚠️ | Permitted for Member **if** `settings.add_to_queue_permission == 'anyone'` AND user has not exceeded `settings.max_queue_items_per_user` |
| **Remove Own Song from Queue**| ✅ | ✅ | ✅ | A member can always remove a track they personally queued |
| **Remove Any Song from Queue**| ✅ | ✅ | ❌ | Host/Mod curation authority |
| **Reorder Queue Items** | ✅ | ✅ | ⚠️ | Permitted for Member **only if** `settings.reorder_queue_permission == 'anyone'` |
| **Clear Entire Queue** | ✅ | ❌ | ❌ | High-impact action reserved for Owner |
| **Send Chat Message** | ✅ | ✅ | ⚠️ | Permitted for Member **if** `settings.chat_enabled == true` AND member has verified room passcode |
| **Delete Any Chat Message** | ✅ | ✅ | ❌ | Moderation capability |
| **Kick / Remove Member** | ✅ | ⚠️ | ❌ | Moderator can only kick standard `member` roles (cannot kick Owner or other Mods) |
| **Mute Member in Chat** | ✅ | ✅ | ❌ | Mutes target member from posting for room duration |
| **Assign / Revoke Moderator**| ✅ | ❌ | ❌ | Owner-exclusive authority |
| **Update Room Settings** | ✅ | ❌ | ❌ | Adjust privacy, permissions, shared speakers, skip thresholds |
| **Update Room Password** | ✅ | ❌ | ❌ | Updates `room_secrets.password_hash` via security definer RPC |
| **Transfer Room Ownership** | ✅ | ❌ | ❌ | Explicitly transfers `owner` role to another active member |
| **Archive / Delete Room** | ✅ | ❌ | ❌ | Permanent room retirement |

---

## 3. Room Modes & Privacy Controls

### 3.1 Room Privacy Classes
1. **Public (`public`)**:
   - Displayed in the public Explore/Lobby directory.
   - Any guest can discover, preview, and join without restrictions.
2. **Unlisted (`unlisted`)**:
   - Hidden from the public Lobby.
   - Accessible only via direct URL (e.g., `https://jamroom.live/rooms/neon-sunset-88`).
   - Ideal for private friend groups or team standups.
3. **Password-Protected (`password`)**:
   - Can be either listed or unlisted.
   - Passcodes are hashed with `bcrypt` / `pgcrypto` and isolated in `room_secrets`.
   - Joining requires calling `rpc_join_room(p_room_id, p_passcode)`.
   - Successful validation sets `room_members.has_valid_passcode = true`.

### 3.2 Dynamic Room Settings Schema (`rooms.settings`)
```json
{
  "shared_speakers": false,
  "add_to_queue_permission": "anyone",
  "reorder_queue_permission": "host_and_mods_only",
  "vote_skip_enabled": true,
  "skip_vote_threshold_percent": 50,
  "max_queue_items_per_user": 5,
  "chat_enabled": true,
  "auto_play_on_queue_add": true
}
```

---

## 4. Server-Side Enforcement (RPC Security Example)

No client-side flag or role payload is ever trusted. Permissions are verified dynamically inside PostgreSQL transactions:

```sql
CREATE OR REPLACE FUNCTION public.rpc_assert_room_permission(
    p_room_id UUID,
    p_required_roles TEXT[],
    p_allow_shared_speaker BOOLEAN DEFAULT false
)
RETURNS public.room_members AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_member public.room_members%ROWTYPE;
    v_room public.rooms%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Authentication required';
    END IF;

    -- Fetch member record
    SELECT * INTO v_member
    FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Not a member of this room';
    END IF;

    -- If password protected, ensure user verified passcode
    IF v_member.has_valid_passcode IS FALSE THEN
        RAISE EXCEPTION 'FORBIDDEN: Room passcode verification required';
    END IF;

    -- Check explicit role match
    IF v_member.role = ANY(p_required_roles) THEN
        RETURN v_member;
    END IF;

    -- Check if operation allows shared speaker bypass
    IF p_allow_shared_speaker THEN
        SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
        IF (v_room.settings->>'shared_speakers')::boolean IS TRUE THEN
            RETURN v_member;
        END IF;
    END IF;

    RAISE EXCEPTION 'FORBIDDEN: Insufficient room permissions';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
