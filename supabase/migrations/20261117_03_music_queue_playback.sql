-- ============================================================================
-- JAMROOM MIGRATION: 20261117_03_music_queue_playback.sql
-- Module: Phase 5 & 6 - Music Catalog, Collaborative Queue & Playback Sync RPCs
-- ============================================================================

-- 1. SONGS TABLE (Normalized Global YouTube Catalog)
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

-- 2. QUEUE ITEMS TABLE (Collaborative High-Precision Fractional Indexing)
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

-- 3. SKIP VOTES TABLE
CREATE TABLE IF NOT EXISTS public.skip_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    queue_item_id UUID NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_user_skip_vote UNIQUE (queue_item_id, user_id)
);

-- 4. MESSAGES TABLE (Realtime Chat)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(trim(content)) >= 1 AND char_length(content) <= 1000),
    type TEXT NOT NULL CHECK (type IN ('user', 'system', 'announcement')) DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_songs_youtube_id ON public.songs(youtube_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_room_status ON public.queue_items(room_id, status, position);
CREATE INDEX IF NOT EXISTS idx_skip_votes_queue_item ON public.skip_votes(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON public.messages(room_id, created_at DESC);

-- 6. ENABLE RLS
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skip_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 6.1 Songs RLS (Read-only for all, inserts allowed for authenticated guests)
DROP POLICY IF EXISTS "Songs viewable by everyone" ON public.songs;
CREATE POLICY "Songs viewable by everyone" ON public.songs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert songs" ON public.songs;
CREATE POLICY "Authenticated users can insert songs" ON public.songs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6.2 Queue Items RLS
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

-- 6.3 Skip Votes RLS
DROP POLICY IF EXISTS "Skip votes viewable by everyone" ON public.skip_votes;
CREATE POLICY "Skip votes viewable by everyone" ON public.skip_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members can cast skip votes" ON public.skip_votes;
CREATE POLICY "Members can cast skip votes" ON public.skip_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can rescind own skip vote" ON public.skip_votes;
CREATE POLICY "Users can rescind own skip vote" ON public.skip_votes FOR DELETE USING (auth.uid() = user_id);

-- 6.4 Messages RLS
DROP POLICY IF EXISTS "Messages viewable by everyone" ON public.messages;
CREATE POLICY "Messages viewable by everyone" ON public.messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated guests can post messages" ON public.messages;
CREATE POLICY "Authenticated guests can post messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 7. STORED PROCEDURES & RPC FUNCTIONS
-- ============================================================================

-- 7.1 RPC: Add Track to Queue (Atomically Upserts Song and Calculates Fractional Position)
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
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_song_id UUID;
    v_last_pos NUMERIC(20, 10);
    v_new_pos NUMERIC(20, 10);
    v_queue_item_id UUID;
    v_is_first_song BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to queue tracks' USING ERRCODE = '42501';
    END IF;

    -- Upsert Song into global catalog
    INSERT INTO public.songs (youtube_id, title, artist_channel, duration_seconds, thumbnail_url)
    VALUES (p_youtube_id, p_title, p_artist_channel, p_duration_seconds, p_thumbnail_url)
    ON CONFLICT (youtube_id) DO UPDATE
    SET title = EXCLUDED.title,
        artist_channel = EXCLUDED.artist_channel,
        duration_seconds = EXCLUDED.duration_seconds,
        thumbnail_url = EXCLUDED.thumbnail_url
    RETURNING id INTO v_song_id;

    -- Lock room queue to prevent position collision
    PERFORM pg_advisory_xact_lock(hashtext('room_queue_' || p_room_id::text));

    -- Determine highest current position in queue
    SELECT COALESCE(MAX(position), 0.0) INTO v_last_pos
    FROM public.queue_items
    WHERE room_id = p_room_id AND status = 'queued';

    v_new_pos := v_last_pos + 1000.0000000000;

    -- Check if there is currently an active playing song
    IF NOT EXISTS (
        SELECT 1 FROM public.playback_states
        WHERE room_id = p_room_id AND current_queue_item_id IS NOT NULL
    ) THEN
        v_is_first_song := true;
    END IF;

    -- Insert new queue item
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

    -- If this is the first song in an empty room, immediately set as active playback
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

-- 7.2 RPC: Advance to Next Song (Atomic Queue Transition)
CREATE OR REPLACE FUNCTION public.rpc_advance_to_next_song(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_current_item_id UUID;
    v_next_item RECORD;
BEGIN
    v_user_id := auth.uid();

    -- Lock room queue
    PERFORM pg_advisory_xact_lock(hashtext('room_advance_' || p_room_id::text));

    -- Get current playing item
    SELECT current_queue_item_id INTO v_current_item_id
    FROM public.playback_states
    WHERE room_id = p_room_id;

    -- Mark previous track as played
    IF v_current_item_id IS NOT NULL THEN
        UPDATE public.queue_items
        SET status = 'played', updated_at = clock_timestamp()
        WHERE id = v_current_item_id;
    END IF;

    -- Clean up skip votes for the old track
    IF v_current_item_id IS NOT NULL THEN
        DELETE FROM public.skip_votes WHERE queue_item_id = v_current_item_id;
    END IF;

    -- Select next queued song in order of fractional position
    SELECT qi.id, qi.song_id, qi.position
    INTO v_next_item
    FROM public.queue_items qi
    WHERE qi.room_id = p_room_id AND qi.status = 'queued'
    ORDER BY qi.position ASC
    LIMIT 1;

    IF v_next_item.id IS NOT NULL THEN
        -- Mark next track as playing
        UPDATE public.queue_items
        SET status = 'playing', updated_at = clock_timestamp()
        WHERE id = v_next_item.id;

        -- Update playback state
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
        -- No more items in queue; set playback to stopped
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

-- 7.3 RPC: Set Authoritative Playback State (Play, Pause, Seek with Optimistic Versioning)
CREATE OR REPLACE FUNCTION public.rpc_set_playback_state(
    p_room_id UUID,
    p_is_playing BOOLEAN,
    p_position_seconds NUMERIC,
    p_expected_version BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_current_version BIGINT;
    v_new_version BIGINT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Check current version for optimistic concurrency
    SELECT playback_version INTO v_current_version
    FROM public.playback_states
    WHERE room_id = p_room_id;

    IF v_current_version IS NOT NULL AND p_expected_version > 0 AND v_current_version != p_expected_version THEN
        -- Version mismatch (stale update rejected)
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

-- 7.4 RPC: Democratic Skip Vote (Server-Authoritative Active Member Calculation)
CREATE OR REPLACE FUNCTION public.rpc_vote_to_skip(p_room_id UUID, p_queue_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_active_members_count INTEGER;
    v_skip_threshold_percent INTEGER;
    v_votes_required INTEGER;
    v_current_votes_count INTEGER;
    v_skipped BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to vote' USING ERRCODE = '42501';
    END IF;

    -- Insert or ignore vote
    INSERT INTO public.skip_votes (room_id, queue_item_id, user_id)
    VALUES (p_room_id, p_queue_item_id, v_user_id)
    ON CONFLICT (queue_item_id, user_id) DO NOTHING;

    -- Count active members (heartbeat within last 60 seconds)
    SELECT COUNT(DISTINCT user_id) INTO v_active_members_count
    FROM public.room_members
    WHERE room_id = p_room_id
      AND last_active_at >= (clock_timestamp() - INTERVAL '60 seconds');

    IF v_active_members_count < 1 THEN
        v_active_members_count := 1;
    END IF;

    -- Read room skip threshold percent
    SELECT COALESCE((settings->>'skip_vote_threshold_percent')::int, 50)
    INTO v_skip_threshold_percent
    FROM public.rooms
    WHERE id = p_room_id;

    -- Calculate required votes (minimum 1)
    v_votes_required := GREATEST(1, CEIL((v_active_members_count * v_skip_threshold_percent)::numeric / 100.0)::int);

    -- Count total votes cast for this queue item
    SELECT COUNT(*) INTO v_current_votes_count
    FROM public.skip_votes
    WHERE queue_item_id = p_queue_item_id;

    -- Check if vote threshold is reached
    IF v_current_votes_count >= v_votes_required THEN
        -- Auto-advance to next song
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
