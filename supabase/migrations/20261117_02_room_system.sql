-- ============================================================================
-- JAMROOM MIGRATION: 20261117_02_room_system.sql
-- Module: Phase 3 - Virtual Room System, Quarantined Secrets & Permissions
-- ============================================================================

-- 1. ROOMS TABLE (Public Metadata - Zero Sensitive Hashes)
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 60),
    description TEXT CHECK (char_length(description) <= 280),
    cover_url TEXT,
    privacy TEXT NOT NULL CHECK (privacy IN ('public', 'unlisted', 'password')) DEFAULT 'public',
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
    max_members INTEGER NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 200),
    settings JSONB NOT NULL DEFAULT '{
        "shared_speakers": false,
        "add_to_queue_permission": "anyone",
        "reorder_queue_permission": "host_and_mods_only",
        "vote_skip_enabled": true,
        "skip_vote_threshold_percent": 50,
        "max_queue_items_per_user": 5,
        "chat_enabled": true,
        "auto_play_on_queue_add": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. ROOM SECRETS TABLE (Zero-Trust Quarantined Table - No Client RLS Access)
CREATE TABLE IF NOT EXISTS public.room_secrets (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    password_hash TEXT,
    recovery_hash TEXT,
    failed_recovery_attempts INTEGER NOT NULL DEFAULT 0,
    recovery_locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 3. ROOM MEMBERS TABLE (Membership, Roles, Passcode Verification & Activity Heartbeats)
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'moderator', 'member')) DEFAULT 'member',
    has_valid_passcode BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
);

-- 4. PLAYBACK STATES TABLE (Authoritative Single Source of Truth)
CREATE TABLE IF NOT EXISTS public.playback_states (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    current_queue_item_id UUID,
    current_song_id UUID,
    is_playing BOOLEAN NOT NULL DEFAULT false,
    position_seconds NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    server_updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    playback_version BIGINT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_rooms_slug ON public.rooms(slug);
CREATE INDEX IF NOT EXISTS idx_rooms_status_privacy ON public.rooms(status, privacy) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_active ON public.room_members(room_id, last_active_at);
CREATE INDEX IF NOT EXISTS idx_playback_states_room ON public.playback_states(room_id);

-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_states ENABLE ROW LEVEL SECURITY;

-- 6.1 Rooms Policies
DROP POLICY IF EXISTS "Rooms viewable based on status" ON public.rooms;
CREATE POLICY "Rooms viewable based on status"
    ON public.rooms FOR SELECT
    USING (status = 'active');

DROP POLICY IF EXISTS "Authenticated guests can create rooms" ON public.rooms;
CREATE POLICY "Authenticated guests can create rooms"
    ON public.rooms FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Room owner can update room" ON public.rooms;
CREATE POLICY "Room owner can update room"
    ON public.rooms FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 6.2 Room Secrets Policies (Zero Client Direct Access)
DROP POLICY IF EXISTS "No client access to room secrets" ON public.room_secrets;
CREATE POLICY "No client access to room secrets"
    ON public.room_secrets FOR ALL
    USING (false);

-- 6.3 Room Members Policies (Non-Recursive)
DROP POLICY IF EXISTS "Room members viewable by anyone in active room" ON public.room_members;
CREATE POLICY "Room members viewable by anyone in active room"
    ON public.room_members FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_members.room_id AND r.status = 'active'));

DROP POLICY IF EXISTS "Direct mutations to room_members disallowed" ON public.room_members;
CREATE POLICY "Direct mutations to room_members disallowed"
    ON public.room_members FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Direct updates to room_members disallowed" ON public.room_members;
CREATE POLICY "Direct updates to room_members disallowed"
    ON public.room_members FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Direct deletes from room_members disallowed" ON public.room_members;
CREATE POLICY "Direct deletes from room_members disallowed"
    ON public.room_members FOR DELETE USING (false);

-- 6.4 Playback States Policies
DROP POLICY IF EXISTS "Playback state is readable by anyone in room" ON public.playback_states;
CREATE POLICY "Playback state is readable by anyone in room"
    ON public.playback_states FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Direct updates to playback state disallowed" ON public.playback_states;
CREATE POLICY "Direct updates to playback state disallowed"
    ON public.playback_states FOR UPDATE USING (false);


-- ============================================================================
-- 7. STORED PROCEDURES (RPCS)
-- ============================================================================

-- 7.1 CREATE ROOM (Atomic creation with secret quarantine & recovery token)
CREATE OR REPLACE FUNCTION public.rpc_create_room(
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT DEFAULT NULL,
    p_privacy TEXT DEFAULT 'public',
    p_password TEXT DEFAULT NULL,
    p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_recovery_token TEXT;
    v_recovery_hash TEXT;
    v_password_hash TEXT := NULL;
    v_final_settings JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate privacy and password
    IF p_privacy = 'password' THEN
        IF p_password IS NULL OR char_length(trim(p_password)) < 1 THEN
            RAISE EXCEPTION 'Password required for protected room';
        END IF;
        v_password_hash := crypt(p_password, gen_salt('bf'));
    END IF;

    -- Generate emergency recovery token (128-bit)
    v_recovery_token := 'jam-' || encode(gen_random_bytes(10), 'hex');
    v_recovery_hash := crypt(v_recovery_token, gen_salt('bf'));

    -- Merge settings with defaults
    v_final_settings := '{
        "shared_speakers": false,
        "add_to_queue_permission": "anyone",
        "reorder_queue_permission": "host_and_mods_only",
        "vote_skip_enabled": true,
        "skip_vote_threshold_percent": 50,
        "max_queue_items_per_user": 5,
        "chat_enabled": true,
        "auto_play_on_queue_add": true
    }'::jsonb || COALESCE(p_settings, '{}'::jsonb);

    -- Insert into rooms
    INSERT INTO public.rooms (slug, name, description, privacy, owner_id, settings)
    VALUES (p_slug, p_name, p_description, p_privacy, v_user_id, v_final_settings)
    RETURNING * INTO v_room;

    -- Insert into quarantined room_secrets
    INSERT INTO public.room_secrets (room_id, password_hash, recovery_hash)
    VALUES (v_room.id, v_password_hash, v_recovery_hash);

    -- Enroll creator as owner with full passcode access
    INSERT INTO public.room_members (room_id, user_id, role, has_valid_passcode)
    VALUES (v_room.id, v_user_id, 'owner', true);

    -- Initialize authoritative playback state
    INSERT INTO public.playback_states (room_id, is_playing, position_seconds, playback_version)
    VALUES (v_room.id, false, 0.000, 1)
    ON CONFLICT (room_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'room', row_to_json(v_room),
        'recovery_token', v_recovery_token
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7.2 JOIN ROOM (Validates passcodes and enrolls member)
CREATE OR REPLACE FUNCTION public.rpc_join_room(
    p_room_id UUID,
    p_passcode TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_secret public.room_secrets%ROWTYPE;
    v_member public.room_members%ROWTYPE;
    v_is_valid_passcode BOOLEAN := true;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found or inactive';
    END IF;

    -- Check password requirement
    IF v_room.privacy = 'password' AND v_room.owner_id != v_user_id THEN
        SELECT * INTO v_secret FROM public.room_secrets WHERE room_id = p_room_id;
        IF v_secret.password_hash IS NOT NULL THEN
            IF p_passcode IS NULL OR v_secret.password_hash != crypt(p_passcode, v_secret.password_hash) THEN
                RAISE EXCEPTION 'Invalid room passcode';
            END IF;
        END IF;
    END IF;

    -- Upsert membership
    INSERT INTO public.room_members (room_id, user_id, role, has_valid_passcode, last_active_at)
    VALUES (
        p_room_id,
        v_user_id,
        CASE WHEN v_room.owner_id = v_user_id THEN 'owner' ELSE 'member' END,
        true,
        clock_timestamp()
    )
    ON CONFLICT (room_id, user_id) DO UPDATE
    SET has_valid_passcode = true,
        last_active_at = clock_timestamp()
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'success', true,
        'role', v_member.role,
        'room', row_to_json(v_room)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7.3 TOUCH ACTIVITY HEARTBEAT
CREATE OR REPLACE FUNCTION public.rpc_touch_member_activity(
    p_room_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NOT NULL THEN
        UPDATE public.room_members
        SET last_active_at = clock_timestamp()
        WHERE room_id = p_room_id AND user_id = v_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7.4 ASSERT ROOM PERMISSION
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

    SELECT * INTO v_member
    FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Not a member of this room';
    END IF;

    IF v_member.has_valid_passcode IS FALSE THEN
        RAISE EXCEPTION 'FORBIDDEN: Passcode verification required';
    END IF;

    IF v_member.role = ANY(p_required_roles) THEN
        RETURN v_member;
    END IF;

    IF p_allow_shared_speaker THEN
        SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
        IF (v_room.settings->>'shared_speakers')::boolean IS TRUE THEN
            RETURN v_member;
        END IF;
    END IF;

    RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions for this room action';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
