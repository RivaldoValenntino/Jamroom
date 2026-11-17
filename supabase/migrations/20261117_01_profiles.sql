-- ============================================================================
-- JAMROOM MIGRATION: 20261117_01_profiles.sql
-- Module: Phase 2 - Guest Identity & Anonymous Profiles
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE
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

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- 3. AUTO PROFILE GENERATION ON ANONYMOUS AUTH TRIGGER
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

-- 4. ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are readable by anyone" ON public.profiles;
CREATE POLICY "Public profiles are readable by anyone"
    ON public.profiles FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can only update their own profile" ON public.profiles;
CREATE POLICY "Users can only update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 5. SCHEDULED PRUNING PROCEDURE (Protecting active room owners)
CREATE OR REPLACE FUNCTION public.prune_abandoned_guest_accounts()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH candidates AS (
        SELECT p.id
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE (u.is_anonymous IS TRUE OR u.email IS NULL)
          AND p.last_seen_at < (clock_timestamp() - INTERVAL '30 days')
          AND NOT EXISTS (
              SELECT 1 FROM public.rooms r
              WHERE r.owner_id = p.id AND r.status = 'active'
          )
        LIMIT 500
    )
    DELETE FROM auth.users
    WHERE id IN (SELECT id FROM candidates);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
