-- ==============================================================================
-- JAMROOM: PLAYBACK HISTORY AUTO-RECORD & TRIGGER MIGRATION
-- File: supabase/migrations/20261117_fix_playback_history.sql
-- ==============================================================================

-- 1. Ensure playback_history table exists
CREATE TABLE IF NOT EXISTS public.playback_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    played_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    duration_seconds INTEGER NOT NULL DEFAULT 0
);

-- Index for speedy room history lookups
CREATE INDEX IF NOT EXISTS idx_playback_history_room ON public.playback_history(room_id, played_at DESC);

-- Enable RLS
ALTER TABLE public.playback_history ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies
DROP POLICY IF EXISTS "Playback history viewable by everyone" ON public.playback_history;
CREATE POLICY "Playback history viewable by everyone" ON public.playback_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert playback history" ON public.playback_history;
CREATE POLICY "Insert playback history" ON public.playback_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================================
-- 3. TRIGGER FUNCTION: Auto-record history when a song transitions to 'playing'
-- Condition: Minimal pernah di-play, tidak perlu tunggu lagu selesai
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.trg_record_playback_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_song public.songs%ROWTYPE;
BEGIN
    -- Trigger whenever status becomes 'playing'
    IF NEW.status = 'playing' AND (OLD.status IS NULL OR OLD.status <> 'playing') THEN
        SELECT * INTO v_song FROM public.songs WHERE id = NEW.song_id;
        IF FOUND THEN
            -- Deduplicate consecutive duplicate entries within 15 seconds
            IF NOT EXISTS (
                SELECT 1 FROM public.playback_history
                WHERE room_id = NEW.room_id
                  AND song_id = NEW.song_id
                  AND played_at >= (clock_timestamp() - INTERVAL '15 seconds')
            ) THEN
                INSERT INTO public.playback_history (
                    room_id,
                    song_id,
                    played_by,
                    played_at,
                    duration_seconds
                ) VALUES (
                    NEW.room_id,
                    NEW.song_id,
                    NEW.added_by,
                    clock_timestamp(),
                    COALESCE(v_song.duration_seconds, 0)
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_item_to_history ON public.queue_items;
CREATE TRIGGER trg_queue_item_to_history
AFTER INSERT OR UPDATE OF status ON public.queue_items
FOR EACH ROW
WHEN (NEW.status = 'playing')
EXECUTE FUNCTION public.trg_record_playback_history();

-- ==============================================================================
-- 4. BACKFILL: Insert any songs currently 'playing' or 'played' in existing rooms
-- ==============================================================================
INSERT INTO public.playback_history (room_id, song_id, played_by, played_at, duration_seconds)
SELECT 
    qi.room_id,
    qi.song_id,
    qi.added_by,
    COALESCE(qi.updated_at, clock_timestamp()),
    COALESCE(s.duration_seconds, 0)
FROM public.queue_items qi
JOIN public.songs s ON s.id = qi.song_id
WHERE qi.status IN ('playing', 'played')
  AND NOT EXISTS (
      SELECT 1 FROM public.playback_history ph
      WHERE ph.room_id = qi.room_id AND ph.song_id = qi.song_id
  );
