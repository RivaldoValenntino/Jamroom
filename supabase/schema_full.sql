-- ============================================================================
-- JAMROOM CONSOLIDATED PRODUCTION DATABASE SCHEMA
-- Jalankan seluruh script ini di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (Tamu Anonim & Pengguna Terdaftar)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT username_format CHECK (username IS NULL OR username ~* '^[a-zA-Z0-9_-]{3,30}$')
);

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Trigger pembuatan profil otomatis saat anonymous auth sign in
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
    v_random_suffix TEXT;
BEGIN
    v_random_suffix := substr(NEW.id::text, 1, 6);
    
    INSERT INTO public.profiles (id, username, display_name, avatar_url, last_seen_at)
    VALUES (
        NEW.id,
        'guest_' || v_random_suffix,
        COALESCE(NEW.raw_user_meta_data->>'display_name', 'Guest ' || v_random_suffix),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || NEW.id::text),
        clock_timestamp()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are readable by anyone" ON public.profiles;
CREATE POLICY "Public profiles are readable by anyone"
    ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can only update their own profile" ON public.profiles;
CREATE POLICY "Users can only update their own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. ROOMS TABLE (Metadata Lounge Virtual)
-- ============================================================================
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

-- ============================================================================
-- 3. ROOM SECRETS (Karantina Hash Password & Recovery Token - Zero RLS Access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.room_secrets (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    password_hash TEXT,
    recovery_hash TEXT,
    failed_recovery_attempts INTEGER NOT NULL DEFAULT 0,
    recovery_locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 4. ROOM MEMBERS (Daftar Anggota, Peran, & Heartbeat)
-- ============================================================================
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

-- ============================================================================
-- 5. SONGS (Katalog Lagu YouTube Ternormalisasi)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_channel TEXT,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
    thumbnail_url TEXT,
    raw_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 6. QUEUE ITEMS (Antrean Lagu Berpresisi Tinggi NUMERIC(20, 10))
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.queue_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE RESTRICT,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    position NUMERIC(20, 10) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'playing', 'played', 'skipped')) DEFAULT 'queued',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 7. PLAYBACK STATES (Single Source of Truth Sinkronisasi Audio)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.playback_states (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    current_queue_item_id UUID REFERENCES public.queue_items(id) ON DELETE SET NULL,
    current_song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
    is_playing BOOLEAN NOT NULL DEFAULT false,
    position_seconds NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    server_updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    playback_version BIGINT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 8. SKIP VOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.skip_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    queue_item_id UUID NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_user_skip_vote UNIQUE (queue_item_id, user_id)
);

-- ============================================================================
-- 9. MESSAGES (Live Chat)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1 AND char_length(content) <= 1000),
    type TEXT NOT NULL CHECK (type IN ('user', 'system', 'announcement')) DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 10. PLAYLISTS & PLAYLIST ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 100),
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.playlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_playlist_position UNIQUE (playlist_id, position)
);

-- ============================================================================
-- 11. PLAYBACK HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    played_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    duration_seconds INTEGER NOT NULL
);

-- ============================================================================
-- 12. YOUTUBE SEARCH CACHE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.youtube_search_cache (
    query_hash TEXT PRIMARY KEY,
    query_text TEXT NOT NULL,
    results JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- 13. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_rooms_slug ON public.rooms(slug);
CREATE INDEX IF NOT EXISTS idx_rooms_status_privacy ON public.rooms(status, privacy) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_active ON public.room_members(room_id, last_active_at);
CREATE INDEX IF NOT EXISTS idx_songs_youtube_id ON public.songs(youtube_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_room_status ON public.queue_items(room_id, status, position);
CREATE INDEX IF NOT EXISTS idx_playback_states_room ON public.playback_states(room_id);
CREATE INDEX IF NOT EXISTS idx_skip_votes_queue ON public.skip_votes(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON public.messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_user ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playback_history_room ON public.playback_history(room_id, played_at DESC);

-- ============================================================================
-- 14. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skip_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_search_cache ENABLE ROW LEVEL SECURITY;

-- Rooms
DROP POLICY IF EXISTS "Rooms viewable based on status" ON public.rooms;
CREATE POLICY "Rooms viewable based on status" ON public.rooms FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "Authenticated guests can create rooms" ON public.rooms;
CREATE POLICY "Authenticated guests can create rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Room owner can update room" ON public.rooms;
CREATE POLICY "Room owner can update room" ON public.rooms FOR UPDATE USING (auth.uid() = owner_id);

-- Room Secrets (Isolasi Total)
DROP POLICY IF EXISTS "No client access to room secrets" ON public.room_secrets;
CREATE POLICY "No client access to room secrets" ON public.room_secrets FOR ALL USING (false);

-- Room Members
DROP POLICY IF EXISTS "Members readable by everyone" ON public.room_members;
CREATE POLICY "Members readable by everyone" ON public.room_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members can be inserted by authenticated users" ON public.room_members;
CREATE POLICY "Members can be inserted by authenticated users" ON public.room_members FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can update their own row" ON public.room_members;
CREATE POLICY "Members can update their own row" ON public.room_members FOR UPDATE USING (auth.uid() = user_id);

-- Songs
DROP POLICY IF EXISTS "Songs viewable by everyone" ON public.songs;
CREATE POLICY "Songs viewable by everyone" ON public.songs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert songs" ON public.songs;
CREATE POLICY "Authenticated users can insert songs" ON public.songs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Queue Items
DROP POLICY IF EXISTS "Queue items viewable by room members" ON public.queue_items;
CREATE POLICY "Queue items viewable by room members" ON public.queue_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members can insert queue items" ON public.queue_items;
CREATE POLICY "Members can insert queue items" ON public.queue_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Members or mods can delete queue items" ON public.queue_items;
CREATE POLICY "Members or mods can delete queue items" ON public.queue_items FOR DELETE
USING (
    auth.uid() = added_by OR
    EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = queue_items.room_id
          AND rm.user_id = auth.uid()
          AND rm.role IN ('owner', 'moderator')
    )
);

-- Playback States
DROP POLICY IF EXISTS "Playback state is readable by anyone in room" ON public.playback_states;
CREATE POLICY "Playback state is readable by anyone in room" ON public.playback_states FOR SELECT USING (true);

DROP POLICY IF EXISTS "Direct updates to playback state allowed for authenticated users" ON public.playback_states;
CREATE POLICY "Direct updates to playback state allowed for authenticated users" ON public.playback_states FOR ALL USING (auth.uid() IS NOT NULL);

-- Skip Votes
DROP POLICY IF EXISTS "Skip votes viewable by everyone" ON public.skip_votes;
CREATE POLICY "Skip votes viewable by everyone" ON public.skip_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members can cast skip votes" ON public.skip_votes;
CREATE POLICY "Members can cast skip votes" ON public.skip_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can rescind own skip vote" ON public.skip_votes;
CREATE POLICY "Users can rescind own skip vote" ON public.skip_votes FOR DELETE USING (auth.uid() = user_id);

-- Messages
DROP POLICY IF EXISTS "Messages viewable by everyone" ON public.messages;
CREATE POLICY "Messages viewable by everyone" ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated guests can post messages" ON public.messages;
CREATE POLICY "Authenticated guests can post messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Playlists
DROP POLICY IF EXISTS "Playlists viewable by owner or if public" ON public.playlists;
CREATE POLICY "Playlists viewable by owner or if public" ON public.playlists FOR SELECT USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can insert own playlists" ON public.playlists;
CREATE POLICY "Users can insert own playlists" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own playlists" ON public.playlists;
CREATE POLICY "Users can update own playlists" ON public.playlists FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own playlists" ON public.playlists;
CREATE POLICY "Users can delete own playlists" ON public.playlists FOR DELETE USING (auth.uid() = user_id);

-- Playlist Items
DROP POLICY IF EXISTS "Playlist items viewable if playlist viewable" ON public.playlist_items;
CREATE POLICY "Playlist items viewable if playlist viewable" ON public.playlist_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.playlists p
        WHERE p.id = playlist_items.playlist_id
          AND (p.user_id = auth.uid() OR p.is_public = true)
    )
);

DROP POLICY IF EXISTS "Playlist owner can manage items" ON public.playlist_items;
CREATE POLICY "Playlist owner can manage items" ON public.playlist_items FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.playlists p
        WHERE p.id = playlist_items.playlist_id
          AND p.user_id = auth.uid()
    )
);

-- Playback History
DROP POLICY IF EXISTS "Playback history viewable by everyone" ON public.playback_history;
CREATE POLICY "Playback history viewable by everyone" ON public.playback_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert playback history" ON public.playback_history;
CREATE POLICY "Insert playback history" ON public.playback_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- YouTube Search Cache
DROP POLICY IF EXISTS "Search cache viewable by everyone" ON public.youtube_search_cache;
CREATE POLICY "Search cache viewable by everyone" ON public.youtube_search_cache FOR SELECT USING (true);


-- ============================================================================
-- 15. STORED PROCEDURES & ATOMIC RPCS
-- ============================================================================

-- 15.1 CREATE ROOM
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

    -- Pastikan profil owner ada di public.profiles
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        v_user_id,
        'Guest Host',
        'https://api.dicebear.com/7.x/bottts/svg?seed=' || v_user_id::text
    )
    ON CONFLICT (id) DO NOTHING;

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
    VALUES (v_room.id, v_user_id, 'owner', true)
    ON CONFLICT (room_id, user_id) DO UPDATE SET role = 'owner', has_valid_passcode = true;

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


-- 15.2 JOIN ROOM
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
    v_role TEXT := 'member';
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Ensure profile exists
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (v_user_id, 'Guest Listener', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || v_user_id::text)
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    IF v_room.owner_id = v_user_id THEN
        v_role := 'owner';
        v_is_valid_passcode := true;
    ELSIF v_room.privacy = 'password' THEN
        SELECT * INTO v_secret FROM public.room_secrets WHERE room_id = p_room_id;
        IF p_passcode IS NULL OR v_secret.password_hash != crypt(p_passcode, v_secret.password_hash) THEN
            SELECT * INTO v_member FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
            IF NOT FOUND OR v_member.has_valid_passcode IS NOT TRUE THEN
                RAISE EXCEPTION 'INVALID_PASSCODE';
            END IF;
        END IF;
        v_is_valid_passcode := true;
    END IF;

    INSERT INTO public.room_members (room_id, user_id, role, has_valid_passcode, last_active_at)
    VALUES (p_room_id, v_user_id, v_role, v_is_valid_passcode, clock_timestamp())
    ON CONFLICT (room_id, user_id) DO UPDATE
    SET last_active_at = clock_timestamp(),
        has_valid_passcode = CASE WHEN EXCLUDED.has_valid_passcode THEN true ELSE public.room_members.has_valid_passcode END
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'success', true,
        'role', v_member.role,
        'room', row_to_json(v_room)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 15.3 TOUCH MEMBER ACTIVITY (Heartbeat)
CREATE OR REPLACE FUNCTION public.rpc_touch_member_activity(p_room_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.room_members
    SET last_active_at = clock_timestamp()
    WHERE room_id = p_room_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 15.4 CLAIM ROOM OWNERSHIP (Emergency Recovery Key)
CREATE OR REPLACE FUNCTION public.rpc_claim_room_ownership(
    p_room_id UUID,
    p_recovery_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_secret public.room_secrets%ROWTYPE;
    v_new_token TEXT;
    v_new_hash TEXT;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_secret FROM public.room_secrets WHERE room_id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room secrets not found'; END IF;

    -- Check brute-force lockout
    IF v_secret.recovery_locked_until IS NOT NULL AND v_secret.recovery_locked_until > clock_timestamp() THEN
        RAISE EXCEPTION 'RECOVERY_LOCKED';
    END IF;

    -- Verify recovery token hash
    IF v_secret.recovery_hash != crypt(p_recovery_token, v_secret.recovery_hash) THEN
        UPDATE public.room_secrets
        SET failed_recovery_attempts = failed_recovery_attempts + 1,
            recovery_locked_until = CASE
                WHEN failed_recovery_attempts + 1 >= 5 THEN clock_timestamp() + INTERVAL '15 minutes'
                ELSE NULL
            END
        WHERE room_id = p_room_id;
        RAISE EXCEPTION 'INVALID_RECOVERY_KEY';
    END IF;

    -- Rotate recovery token
    v_new_token := 'jam-' || encode(gen_random_bytes(10), 'hex');
    v_new_hash := crypt(v_new_token, gen_salt('bf'));

    UPDATE public.room_secrets
    SET recovery_hash = v_new_hash,
        failed_recovery_attempts = 0,
        recovery_locked_until = NULL,
        updated_at = clock_timestamp()
    WHERE room_id = p_room_id;

    -- Demote old owner to moderator and transfer room owner_id
    UPDATE public.room_members SET role = 'moderator' WHERE room_id = p_room_id AND role = 'owner';
    UPDATE public.rooms SET owner_id = v_user_id WHERE id = p_room_id;

    -- Promote caller to owner
    INSERT INTO public.room_members (room_id, user_id, role, has_valid_passcode, last_active_at)
    VALUES (p_room_id, v_user_id, 'owner', true, clock_timestamp())
    ON CONFLICT (room_id, user_id) DO UPDATE SET role = 'owner', has_valid_passcode = true;

    RETURN jsonb_build_object('success', true, 'new_recovery_token', v_new_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 15.5 ADD QUEUE ITEM
CREATE OR REPLACE FUNCTION public.rpc_add_queue_item(
    p_room_id UUID,
    p_youtube_id TEXT,
    p_title TEXT,
    p_artist_channel TEXT,
    p_duration_seconds INTEGER,
    p_thumbnail_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_song_id UUID;
    v_last_pos NUMERIC(20, 10);
    v_new_pos NUMERIC(20, 10);
    v_queue_item_id UUID;
    v_is_first_song BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Upsert Song
    INSERT INTO public.songs (youtube_id, title, artist_channel, duration_seconds, thumbnail_url)
    VALUES (p_youtube_id, p_title, p_artist_channel, p_duration_seconds, p_thumbnail_url)
    ON CONFLICT (youtube_id) DO UPDATE
    SET title = EXCLUDED.title,
        artist_channel = EXCLUDED.artist_channel,
        duration_seconds = EXCLUDED.duration_seconds,
        thumbnail_url = EXCLUDED.thumbnail_url
    RETURNING id INTO v_song_id;

    -- Lock room queue
    PERFORM pg_advisory_xact_lock(hashtext('room_queue_' || p_room_id::text));

    SELECT COALESCE(MAX(position), 0.0) INTO v_last_pos
    FROM public.queue_items
    WHERE room_id = p_room_id AND status = 'queued';

    v_new_pos := v_last_pos + 1000.0000000000;

    IF NOT EXISTS (
        SELECT 1 FROM public.playback_states
        WHERE room_id = p_room_id AND current_queue_item_id IS NOT NULL
    ) THEN
        v_is_first_song := true;
    END IF;

    INSERT INTO public.queue_items (
        room_id,
        song_id,
        added_by,
        position,
        status
    )
    VALUES (
        p_room_id,
        v_song_id,
        v_user_id,
        v_new_pos,
        CASE WHEN v_is_first_song THEN 'playing' ELSE 'queued' END
    )
    RETURNING id INTO v_queue_item_id;

    IF v_is_first_song THEN
        INSERT INTO public.playback_states (
            room_id,
            current_queue_item_id,
            current_song_id,
            is_playing,
            position_seconds,
            server_updated_at,
            playback_version,
            updated_by
        )
        VALUES (
            p_room_id,
            v_queue_item_id,
            v_song_id,
            true,
            0.000,
            clock_timestamp(),
            1,
            v_user_id
        )
        ON CONFLICT (room_id) DO UPDATE
        SET current_queue_item_id = EXCLUDED.current_queue_item_id,
            current_song_id = EXCLUDED.current_song_id,
            is_playing = true,
            position_seconds = 0.000,
            server_updated_at = clock_timestamp(),
            playback_version = public.playback_states.playback_version + 1,
            updated_by = v_user_id,
            updated_at = clock_timestamp();
    END IF;

    RETURN jsonb_build_object(
        'queue_item_id', v_queue_item_id,
        'song_id', v_song_id,
        'position', v_new_pos,
        'is_playing', v_is_first_song
    );
END;
$$;


-- 15.6 ADVANCE TO NEXT SONG
CREATE OR REPLACE FUNCTION public.rpc_advance_to_next_song(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_item_id UUID;
    v_next_item RECORD;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('room_advance_' || p_room_id::text));

    SELECT current_queue_item_id INTO v_current_item_id
    FROM public.playback_states
    WHERE room_id = p_room_id;

    IF v_current_item_id IS NOT NULL THEN
        UPDATE public.queue_items
        SET status = 'played', updated_at = clock_timestamp()
        WHERE id = v_current_item_id;

        DELETE FROM public.skip_votes WHERE queue_item_id = v_current_item_id;
    END IF;

    SELECT qi.id, qi.song_id, qi.position
    INTO v_next_item
    FROM public.queue_items qi
    WHERE qi.room_id = p_room_id AND qi.status = 'queued'
    ORDER BY qi.position ASC
    LIMIT 1;

    IF v_next_item.id IS NOT NULL THEN
        UPDATE public.queue_items
        SET status = 'playing', updated_at = clock_timestamp()
        WHERE id = v_next_item.id;

        UPDATE public.playback_states
        SET current_queue_item_id = v_next_item.id,
            current_song_id = v_next_item.song_id,
            is_playing = true,
            position_seconds = 0.000,
            server_updated_at = clock_timestamp(),
            playback_version = playback_version + 1,
            updated_by = v_user_id,
            updated_at = clock_timestamp()
        WHERE room_id = p_room_id;

        RETURN jsonb_build_object(
            'has_next', true,
            'queue_item_id', v_next_item.id,
            'song_id', v_next_item.song_id
        );
    ELSE
        UPDATE public.playback_states
        SET current_queue_item_id = NULL,
            current_song_id = NULL,
            is_playing = false,
            position_seconds = 0.000,
            server_updated_at = clock_timestamp(),
            playback_version = playback_version + 1,
            updated_by = v_user_id,
            updated_at = clock_timestamp()
        WHERE room_id = p_room_id;

        RETURN jsonb_build_object('has_next', false);
    END IF;
END;
$$;


-- 15.7 SET PLAYBACK STATE (Play, Pause, Seek)
CREATE OR REPLACE FUNCTION public.rpc_set_playback_state(
    p_room_id UUID,
    p_is_playing BOOLEAN,
    p_position_seconds NUMERIC,
    p_expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_version BIGINT;
    v_new_version BIGINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT playback_version INTO v_current_version
    FROM public.playback_states
    WHERE room_id = p_room_id;

    IF v_current_version IS NOT NULL AND p_expected_version > 0 AND v_current_version != p_expected_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'VERSION_CONFLICT',
            'current_version', v_current_version
        );
    END IF;

    v_new_version := COALESCE(v_current_version, 0) + 1;

    UPDATE public.playback_states
    SET is_playing = p_is_playing,
        position_seconds = p_position_seconds,
        server_updated_at = clock_timestamp(),
        playback_version = v_new_version,
        updated_by = v_user_id,
        updated_at = clock_timestamp()
    WHERE room_id = p_room_id;

    RETURN jsonb_build_object(
        'success', true,
        'playback_version', v_new_version
    );
END;
$$;


-- 15.8 VOTE TO SKIP
CREATE OR REPLACE FUNCTION public.rpc_vote_to_skip(p_room_id UUID, p_queue_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_active_members_count INTEGER;
    v_skip_threshold_percent INTEGER;
    v_votes_required INTEGER;
    v_current_votes_count INTEGER;
    v_skipped BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    INSERT INTO public.skip_votes (room_id, queue_item_id, user_id)
    VALUES (p_room_id, p_queue_item_id, v_user_id)
    ON CONFLICT (queue_item_id, user_id) DO NOTHING;

    SELECT COUNT(DISTINCT user_id) INTO v_active_members_count
    FROM public.room_members
    WHERE room_id = p_room_id
      AND last_active_at >= (clock_timestamp() - INTERVAL '60 seconds');

    IF v_active_members_count < 1 THEN v_active_members_count := 1; END IF;

    SELECT COALESCE((settings->>'skip_vote_threshold_percent')::int, 50)
    INTO v_skip_threshold_percent
    FROM public.rooms
    WHERE id = p_room_id;

    v_votes_required := GREATEST(1, CEIL((v_active_members_count * v_skip_threshold_percent)::numeric / 100.0)::int);

    SELECT COUNT(*) INTO v_current_votes_count
    FROM public.skip_votes
    WHERE queue_item_id = p_queue_item_id;

    IF v_current_votes_count >= v_votes_required THEN
        PERFORM public.rpc_advance_to_next_song(p_room_id);
        v_skipped := true;
    END IF;

    RETURN jsonb_build_object(
        'current_votes', v_current_votes_count,
        'votes_required', v_votes_required,
        'active_members', v_active_members_count,
        'skipped', v_skipped
    );
END;
$$;


-- 15.9 REORDER QUEUE
CREATE OR REPLACE FUNCTION public.rpc_reorder_queue(
    p_room_id UUID,
    p_queue_item_id UUID,
    p_new_position NUMERIC(20, 10)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_min_gap NUMERIC(20, 10);
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    UPDATE public.queue_items
    SET position = p_new_position,
        updated_at = clock_timestamp()
    WHERE id = p_queue_item_id AND room_id = p_room_id AND status = 'queued';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue item not found or not in queued state';
    END IF;

    SELECT MIN(diff) INTO v_min_gap FROM (
        SELECT position - LAG(position) OVER (ORDER BY position ASC) AS diff
        FROM public.queue_items
        WHERE room_id = p_room_id AND status = 'queued'
    ) t WHERE diff IS NOT NULL;

    IF v_min_gap IS NOT NULL AND v_min_gap < 0.0001000000 THEN
        WITH reindexed AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) * 1000.0000000000 AS normalized_pos
            FROM public.queue_items
            WHERE room_id = p_room_id AND status = 'queued'
        )
        UPDATE public.queue_items qi
        SET position = r.normalized_pos,
            updated_at = clock_timestamp()
        FROM reindexed r
        WHERE qi.id = r.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'renormalized', (v_min_gap IS NOT NULL AND v_min_gap < 0.0001000000)
    );
END;
$$;


-- 15.10 IMPORT PLAYLIST TO QUEUE
CREATE OR REPLACE FUNCTION public.rpc_import_playlist_to_queue(p_room_id UUID, p_playlist_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_last_pos NUMERIC(20, 10);
    v_count INTEGER := 0;
    v_item RECORD;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('room_queue_' || p_room_id::text));

    SELECT COALESCE(MAX(position), 0.0) INTO v_last_pos
    FROM public.queue_items
    WHERE room_id = p_room_id;

    FOR v_item IN
        SELECT pi.song_id
        FROM public.playlist_items pi
        WHERE pi.playlist_id = p_playlist_id
        ORDER BY pi.position ASC
    LOOP
        v_last_pos := v_last_pos + 1000.0000000000;
        INSERT INTO public.queue_items (room_id, song_id, added_by, position, status)
        VALUES (p_room_id, v_item.song_id, v_user_id, v_last_pos, 'queued');
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'imported_count', v_count);
END;
$$;
