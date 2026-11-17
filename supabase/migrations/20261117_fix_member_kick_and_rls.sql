-- ==============================================================================
-- JAMROOM: FIX MEMBER KICK, PERMISSIONS, AND RLS POLICIES
-- File: supabase/migrations/20261117_fix_member_kick_and_rls.sql
-- ==============================================================================

-- 1. Enable RLS on room_members (ensure active)
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies on room_members
DROP POLICY IF EXISTS "Members readable by everyone" ON public.room_members;
DROP POLICY IF EXISTS "Members can be inserted by authenticated users" ON public.room_members;
DROP POLICY IF EXISTS "Members can update their own row" ON public.room_members;
DROP POLICY IF EXISTS "Members or hosts can update room members" ON public.room_members;
DROP POLICY IF EXISTS "Hosts and mods can delete room members" ON public.room_members;

-- 3. SELECT: readable by everyone
CREATE POLICY "Members readable by everyone" ON public.room_members
FOR SELECT USING (true);

-- 4. INSERT: authenticated guests can join
CREATE POLICY "Members can be inserted by authenticated users" ON public.room_members
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. UPDATE: user can update own row OR room owner/moderator can manage roles
CREATE POLICY "Members or hosts can update room members" ON public.room_members
FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = room_members.room_id AND r.owner_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = room_members.room_id
          AND rm.user_id = auth.uid()
          AND rm.role IN ('owner', 'moderator')
    )
);

-- 6. DELETE: user can leave OR room owner/moderator can kick members
CREATE POLICY "Hosts and mods can delete room members" ON public.room_members
FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = room_members.room_id AND r.owner_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.room_id = room_members.room_id
          AND rm.user_id = auth.uid()
          AND rm.role IN ('owner', 'moderator')
    )
);

-- ==============================================================================
-- 7. RPC: KICK MEMBER (SECURITY DEFINER)
-- Authoritatively validates host/mod authority and removes target member
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_kick_member(
    p_room_id UUID,
    p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_room_owner UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Retrieve room owner
    SELECT owner_id INTO v_room_owner FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    -- Target cannot be the owner
    IF p_target_user_id = v_room_owner THEN
        RAISE EXCEPTION 'Cannot kick the room owner';
    END IF;

    -- Check caller role
    SELECT role INTO v_caller_role FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_caller_id;

    -- Caller must be host or moderator (or leaving own room)
    IF v_caller_id <> v_room_owner AND v_caller_role NOT IN ('owner', 'moderator') AND v_caller_id <> p_target_user_id THEN
        RAISE EXCEPTION 'Permission denied: only host or moderators can kick members';
    END IF;

    -- Perform deletion
    DELETE FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'kicked_user_id', p_target_user_id,
        'room_id', p_room_id
    );
END;
$$;

-- ==============================================================================
-- 8. RPC: LEAVE ROOM
-- Clean exit for a participant
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_leave_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    DELETE FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- ==============================================================================
-- 9. RPC: CLEANUP INACTIVE MEMBERS
-- Purges disconnected guests whose heartbeats have expired (> 2 mins)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_cleanup_inactive_members(
    p_room_id UUID,
    p_max_idle_seconds INT DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_room_owner UUID;
    v_caller_role TEXT;
    v_purged_count INT := 0;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT owner_id INTO v_room_owner FROM public.rooms WHERE id = p_room_id;
    SELECT role INTO v_caller_role FROM public.room_members WHERE room_id = p_room_id AND user_id = v_caller_id;

    IF v_caller_id <> v_room_owner AND v_caller_role NOT IN ('owner', 'moderator') THEN
        RAISE EXCEPTION 'Only hosts and moderators can clean inactive members';
    END IF;

    -- Delete members who are not the owner and haven't pinged in p_max_idle_seconds
    WITH deleted AS (
        DELETE FROM public.room_members
        WHERE room_id = p_room_id
          AND user_id <> v_room_owner
          AND last_active_at < (clock_timestamp() - (p_max_idle_seconds || ' seconds')::INTERVAL)
        RETURNING user_id
    )
    SELECT count(*) INTO v_purged_count FROM deleted;

    RETURN jsonb_build_object('success', true, 'purged_count', v_purged_count);
END;
$$;
