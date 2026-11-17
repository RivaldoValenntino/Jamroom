-- ==============================================================================
-- JAMROOM: FIX REORDER AND QUEUE ITEMS UPDATE RLS POLICY
-- File: supabase/migrations/20261117_fix_reorder_and_queue_rls.sql
-- ==============================================================================

-- 1. Ensure RLS is active on queue_items
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;

-- 2. Add UPDATE policy on queue_items (was missing, causing PGRST116 on updates)
DROP POLICY IF EXISTS "Members or mods can update queue items" ON public.queue_items;
CREATE POLICY "Members or mods can update queue items" ON public.queue_items FOR UPDATE
USING (
    -- Room owner can always update any queue item
    EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = queue_items.room_id AND r.owner_id = auth.uid()
    )
    OR
    -- Check role and room permissions
    EXISTS (
        SELECT 1 FROM public.rooms r
        LEFT JOIN public.room_members rm ON rm.room_id = r.id AND rm.user_id = auth.uid()
        WHERE r.id = queue_items.room_id AND (
            COALESCE(r.settings->>'reorder_queue_permission', 'anyone') = 'anyone'
            OR rm.role IN ('owner', 'moderator')
            OR queue_items.added_by = auth.uid()
        )
    )
);

-- ==============================================================================
-- 3. RPC: PLAY TRACK NOW ("Play Immediately" drag & drop to top/now playing)
-- Atomically transitions active track, sets target to playing, and syncs playback state
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_play_track_now(
    p_room_id UUID,
    p_queue_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_caller_role TEXT;
    v_target_item public.queue_items%ROWTYPE;
    v_song public.songs%ROWTYPE;
    v_new_version BIGINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT role INTO v_caller_role FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_user_id;

    -- In DJ mode, only owner or moderator can switch tracks unless shared_speakers is enabled
    IF v_room.owner_id <> v_user_id AND v_caller_role NOT IN ('owner', 'moderator')
       AND NOT COALESCE((v_room.settings->>'shared_speakers')::boolean, false) THEN
        RAISE EXCEPTION 'Permission denied: only host or moderators can switch tracks';
    END IF;

    SELECT * INTO v_target_item FROM public.queue_items
    WHERE id = p_queue_item_id AND room_id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue item not found in this room';
    END IF;

    -- 1. Mark currently playing items in this room as played
    UPDATE public.queue_items
    SET status = 'played', updated_at = clock_timestamp()
    WHERE room_id = p_room_id AND status = 'playing';

    -- 2. Mark target item as playing
    UPDATE public.queue_items
    SET status = 'playing', updated_at = clock_timestamp()
    WHERE id = p_queue_item_id
    RETURNING * INTO v_target_item;

    -- 3. Retrieve associated song info
    SELECT * INTO v_song FROM public.songs WHERE id = v_target_item.song_id;

    -- 4. Calculate new playback version timestamp
    v_new_version := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

    -- 5. Upsert authoritative playback state
    INSERT INTO public.playback_states (
        room_id,
        current_queue_item_id,
        current_song_id,
        is_playing,
        position_seconds,
        server_updated_at,
        playback_version,
        updated_by,
        updated_at
    ) VALUES (
        p_room_id,
        v_target_item.id,
        v_target_item.song_id,
        true,
        0,
        clock_timestamp(),
        v_new_version,
        v_user_id,
        clock_timestamp()
    )
    ON CONFLICT (room_id) DO UPDATE SET
        current_queue_item_id = EXCLUDED.current_queue_item_id,
        current_song_id = EXCLUDED.current_song_id,
        is_playing = true,
        position_seconds = 0,
        server_updated_at = clock_timestamp(),
        playback_version = v_new_version,
        updated_by = v_user_id,
        updated_at = clock_timestamp();

    RETURN jsonb_build_object(
        'success', true,
        'queue_item_id', v_target_item.id,
        'song_id', v_target_item.song_id,
        'playback_version', v_new_version
    );
END;
$$;

-- ==============================================================================
-- 4. RPC: REORDER QUEUE
-- Reorders queue item and normalizes fractional positions if gap is tight
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_reorder_queue(
    p_room_id UUID,
    p_queue_item_id UUID,
    p_new_position NUMERIC(20, 10)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_caller_role TEXT;
    v_min_gap NUMERIC(20, 10);
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT role INTO v_caller_role FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_user_id;

    -- Check reorder permission
    IF v_room.owner_id <> v_user_id AND v_caller_role NOT IN ('owner', 'moderator')
       AND COALESCE(v_room.settings->>'reorder_queue_permission', 'anyone') <> 'anyone' THEN
        RAISE EXCEPTION 'Permission denied: only host or moderators can reorder queue';
    END IF;

    UPDATE public.queue_items
    SET position = p_new_position,
        updated_at = clock_timestamp()
    WHERE id = p_queue_item_id AND room_id = p_room_id AND status = 'queued';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Queue item not found or not in queued state';
    END IF;

    -- Re-normalize fractional positions if gap becomes too microscopic (< 0.0001)
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
