-- ============================================================================
-- JAMROOM MIGRATION: 20261117_03_room_categories.sql
-- Room Categories catalog, room category foreign key, and RLS policies
-- ============================================================================

-- 1. Create room_categories table
CREATE TABLE IF NOT EXISTS public.room_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. Seed Predefined Standard Music Categories
INSERT INTO public.room_categories (name, slug, description)
VALUES
    ('Pop', 'pop', 'Catchy mainstream pop, dance-pop, and chart toppers'),
    ('Rock', 'rock', 'Classic rock, alternative, hard rock, and guitar riffs'),
    ('Jazz', 'jazz', 'Smooth jazz, bebop, fusion, and late-night brass lounge'),
    ('R&B', 'r-and-b', 'Rhythm and blues, soul, contemporary neo-soul'),
    ('Hip Hop', 'hip-hop', 'Boom bap, trap, 90s golden age, and conscious beats'),
    ('Electronic', 'electronic', 'EDM, house, techno, ambient, and synthesizer waves'),
    ('Indie', 'indie', 'Indie rock, dream pop, bedroom lo-fi, and shoegaze'),
    ('Dangdut', 'dangdut', 'Indonesian modern and classic dangdut rhythms'),
    ('Classical', 'classical', 'Symphonic orchestra, piano sonatas, and modern cinematic ambient'),
    ('K-Pop', 'k-pop', 'Korean pop music, high energy dance and idol tracks'),
    ('J-Pop', 'j-pop', 'Japanese pop, city pop, and anime original soundtracks'),
    ('Lo-fi', 'lo-fi', 'Chillhop, lofi beats, vinyl crackles, study & deep focus'),
    ('Mixed / Other', 'mixed-other', 'Eclectic multi-genre mix and freeform listening')
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 3. Add category_id to public.rooms
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL;

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON public.rooms(category_id);
CREATE INDEX IF NOT EXISTS idx_rooms_category_status ON public.rooms(category_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_room_categories_slug ON public.room_categories(slug);

-- 5. Backfill any existing rooms that have no category_id to 'Mixed / Other'
UPDATE public.rooms
SET category_id = (SELECT id FROM public.room_categories WHERE slug = 'mixed-other' LIMIT 1)
WHERE category_id IS NULL;

-- 6. Enable RLS on room_categories
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room categories viewable by everyone" ON public.room_categories;
CREATE POLICY "Room categories viewable by everyone" ON public.room_categories 
FOR SELECT USING (true);

-- 7. Update rooms UPDATE policy to allow both room owners and room moderators
DROP POLICY IF EXISTS "Room owner can update room" ON public.rooms;
DROP POLICY IF EXISTS "Room owner or moderator can update room" ON public.rooms;
CREATE POLICY "Room owner or moderator can update room" ON public.rooms 
FOR UPDATE USING (
    auth.uid() = owner_id
    OR EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = public.rooms.id
          AND rm.user_id = auth.uid()
          AND rm.role IN ('owner', 'moderator')
    )
);

-- 8. Update rpc_create_room to support p_category_id
CREATE OR REPLACE FUNCTION public.rpc_create_room(
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT DEFAULT NULL,
    p_privacy TEXT DEFAULT 'public',
    p_password TEXT DEFAULT NULL,
    p_settings JSONB DEFAULT '{}'::jsonb,
    p_category_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms%ROWTYPE;
    v_recovery_token TEXT;
    v_recovery_hash TEXT;
    v_password_hash TEXT := NULL;
    v_final_settings JSONB;
    v_final_category_id UUID := p_category_id;
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

    -- Fallback category if not provided or invalid
    IF v_final_category_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.room_categories WHERE id = v_final_category_id) THEN
        SELECT id INTO v_final_category_id FROM public.room_categories WHERE slug = 'lo-fi' LIMIT 1;
        IF v_final_category_id IS NULL THEN
            SELECT id INTO v_final_category_id FROM public.room_categories LIMIT 1;
        END IF;
    END IF;

    -- Generate emergency recovery token (128-bit)
    v_recovery_token := 'jam-' || encode(gen_random_bytes(10), 'hex');
    v_recovery_hash := crypt(v_recovery_token, gen_salt('bf'));

    -- Merge settings with defaults
    v_final_settings := '{
        "shared_speakers": false,
        "add_to_queue_permission": "anyone",
        "reorder_queue_permission": "host_and_mods_only",
        "delete_queue_permission": "host_and_mods_only",
        "vote_skip_enabled": true,
        "skip_vote_threshold_percent": 50,
        "max_queue_items_per_user": 5,
        "chat_enabled": true,
        "auto_play_on_queue_add": true
    }'::jsonb || COALESCE(p_settings, '{}'::jsonb);

    -- Insert into rooms
    INSERT INTO public.rooms (slug, name, description, privacy, owner_id, settings, category_id)
    VALUES (p_slug, p_name, p_description, p_privacy, v_user_id, v_final_settings, v_final_category_id)
    RETURNING * INTO v_room;

    -- Insert into quarantined room_secrets
    INSERT INTO public.room_secrets (room_id, password_hash, recovery_hash)
    VALUES (v_room.id, v_password_hash, v_recovery_hash);

    -- Enroll creator as owner with full passcode access
    INSERT INTO public.room_members (room_id, user_id, role, has_valid_passcode)
    VALUES (v_room.id, v_user_id, 'owner', true)
    ON CONFLICT (room_id, user_id) DO UPDATE SET role = 'owner', has_valid_passcode = true;

    -- Initialize authoritative playback state
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
        v_room.id,
        NULL,
        NULL,
        false,
        0,
        clock_timestamp(),
        1,
        v_user_id
    )
    ON CONFLICT (room_id) DO NOTHING;

    RETURN jsonb_build_object(
        'room', row_to_json(v_room),
        'recovery_token', v_recovery_token
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
