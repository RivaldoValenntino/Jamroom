-- ============================================================================
-- JAMROOM MIGRATION: 20261117_04_playlists_history.sql
-- Module: Phase 9 - User Playlists, Playlist Items, & Playback History
-- ============================================================================

-- 1. PLAYLISTS TABLE
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 100),
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. PLAYLIST ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.playlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_playlist_position UNIQUE (playlist_id, position)
);

-- 3. PLAYBACK HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    played_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    duration_seconds INTEGER NOT NULL
);

-- 4. YOUTUBE SEARCH CACHE TABLE
CREATE TABLE IF NOT EXISTS public.youtube_search_cache (
    query_hash TEXT PRIMARY KEY,
    query_text TEXT NOT NULL,
    results JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_playlists_user ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON public.playlist_items(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_playback_history_room ON public.playback_history(room_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_search_cache_expires ON public.youtube_search_cache(expires_at);

-- 6. ENABLE RLS
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_search_cache ENABLE ROW LEVEL SECURITY;

-- 6.1 Playlists RLS
DROP POLICY IF EXISTS "Playlists viewable by owner or if public" ON public.playlists;
CREATE POLICY "Playlists viewable by owner or if public" ON public.playlists FOR SELECT
USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can insert own playlists" ON public.playlists;
CREATE POLICY "Users can insert own playlists" ON public.playlists FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own playlists" ON public.playlists;
CREATE POLICY "Users can update own playlists" ON public.playlists FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own playlists" ON public.playlists;
CREATE POLICY "Users can delete own playlists" ON public.playlists FOR DELETE
USING (auth.uid() = user_id);

-- 6.2 Playlist Items RLS
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

-- 6.3 Playback History RLS
DROP POLICY IF EXISTS "Playback history viewable by everyone" ON public.playback_history;
CREATE POLICY "Playback history viewable by everyone" ON public.playback_history FOR SELECT
USING (true);

DROP POLICY IF EXISTS "System and members can insert playback history" ON public.playback_history;
CREATE POLICY "System and members can insert playback history" ON public.playback_history FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 6.4 YouTube Search Cache RLS
DROP POLICY IF EXISTS "Search cache viewable by everyone" ON public.youtube_search_cache;
CREATE POLICY "Search cache viewable by everyone" ON public.youtube_search_cache FOR SELECT
USING (true);

-- 7. RPC: Import Playlist to Room Queue Atomically
CREATE OR REPLACE FUNCTION public.rpc_import_playlist_to_queue(p_room_id UUID, p_playlist_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_last_pos NUMERIC(20, 10);
    v_count INTEGER := 0;
    v_item RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Lock room queue
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
