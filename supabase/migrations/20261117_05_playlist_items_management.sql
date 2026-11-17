-- ============================================================================
-- JAMROOM MIGRATION: 20261117_05_playlist_items_management.sql
-- Stored procedures for adding, removing, and importing playlist items
-- ============================================================================

-- 1. RPC: Add Item to Playlist
CREATE OR REPLACE FUNCTION public.rpc_add_playlist_item(
    p_playlist_id UUID,
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
    v_user_id UUID := auth.uid();
    v_song_id UUID;
    v_next_pos INTEGER;
    v_item_id UUID;
    v_playlist_owner UUID;
    v_song RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Verify ownership of playlist
    SELECT user_id INTO v_playlist_owner
    FROM public.playlists
    WHERE id = p_playlist_id;

    IF v_playlist_owner IS NULL THEN
        RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_playlist_owner != v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this playlist' USING ERRCODE = '42501';
    END IF;

    -- Upsert Song into catalog
    INSERT INTO public.songs (youtube_id, title, artist_channel, duration_seconds, thumbnail_url)
    VALUES (p_youtube_id, p_title, p_artist_channel, p_duration_seconds, p_thumbnail_url)
    ON CONFLICT (youtube_id) DO UPDATE
    SET title = EXCLUDED.title,
        artist_channel = EXCLUDED.artist_channel,
        duration_seconds = EXCLUDED.duration_seconds,
        thumbnail_url = EXCLUDED.thumbnail_url
    RETURNING id INTO v_song_id;

    -- Prevent position race conditions
    PERFORM pg_advisory_xact_lock(hashtext('playlist_items_' || p_playlist_id::text));

    -- Calculate next position
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
    FROM public.playlist_items
    WHERE playlist_id = p_playlist_id;

    -- Insert playlist item
    INSERT INTO public.playlist_items (playlist_id, song_id, position)
    VALUES (p_playlist_id, v_song_id, v_next_pos)
    RETURNING id INTO v_item_id;

    -- Update playlist timestamp
    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = p_playlist_id;

    SELECT id, youtube_id, title, artist_channel, duration_seconds, thumbnail_url
    INTO v_song
    FROM public.songs
    WHERE id = v_song_id;

    RETURN jsonb_build_object(
        'id', v_item_id,
        'playlist_id', p_playlist_id,
        'song_id', v_song_id,
        'position', v_next_pos,
        'song', row_to_json(v_song)
    );
END;
$$;

-- 2. RPC: Remove Item from Playlist
CREATE OR REPLACE FUNCTION public.rpc_remove_playlist_item(
    p_playlist_id UUID,
    p_playlist_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_playlist_owner UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT user_id INTO v_playlist_owner
    FROM public.playlists
    WHERE id = p_playlist_id;

    IF v_playlist_owner IS NULL OR v_playlist_owner != v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this playlist' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.playlist_items
    WHERE id = p_playlist_item_id AND playlist_id = p_playlist_id;

    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = p_playlist_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. RPC: Save Active Room Queue to Playlist
CREATE OR REPLACE FUNCTION public.rpc_save_queue_to_playlist(
    p_playlist_id UUID,
    p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_playlist_owner UUID;
    v_item RECORD;
    v_next_pos INTEGER;
    v_added_count INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT user_id INTO v_playlist_owner
    FROM public.playlists
    WHERE id = p_playlist_id;

    IF v_playlist_owner IS NULL OR v_playlist_owner != v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this playlist' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('playlist_items_' || p_playlist_id::text));

    SELECT COALESCE(MAX(position), 0) INTO v_next_pos
    FROM public.playlist_items
    WHERE playlist_id = p_playlist_id;

    FOR v_item IN
        SELECT qi.song_id
        FROM public.queue_items qi
        WHERE qi.room_id = p_room_id AND qi.status IN ('playing', 'queued')
        ORDER BY qi.position ASC
    LOOP
        v_next_pos := v_next_pos + 1;
        INSERT INTO public.playlist_items (playlist_id, song_id, position)
        VALUES (p_playlist_id, v_item.song_id, v_next_pos)
        ON CONFLICT (playlist_id, position) DO NOTHING;
        v_added_count := v_added_count + 1;
    END LOOP;

    UPDATE public.playlists
    SET updated_at = clock_timestamp()
    WHERE id = p_playlist_id;

    RETURN jsonb_build_object('success', true, 'added_count', v_added_count);
END;
$$;
