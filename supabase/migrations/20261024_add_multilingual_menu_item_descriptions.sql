-- ============================================================================
-- Migration: Add Multilingual Description Columns to public.menu_items
-- Target: Staging & Production Supabase PostgreSQL
-- Timestamp: 2026-10-24
-- 
-- Summary:
--   Adds nullable multilingual food description columns to public.menu_items:
--   - desc_am / description_am (Amharic description)
--   - desc_sid / description_sid (Sidama description)
--
-- Backward Compatibility & Non-Breaking Guarantees:
--   - All new columns are nullable with NULL default.
--   - Existing English name and description columns remain unchanged.
--   - Sync trigger trg_sync_menu_item_columns is updated to keep synonym
--     columns (desc_am <-> description_am, desc_sid <-> description_sid) in sync.
--   - Existing RLS policies (public read, admin manage) automatically apply.
--   - PostgREST schema cache is reloaded via NOTIFY pgrst.
-- ============================================================================

DO $$
BEGIN
    -- 1. Ensure desc_am and description_am exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'desc_am'
    ) THEN
        ALTER TABLE public.menu_items ADD COLUMN desc_am TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'description_am'
    ) THEN
        ALTER TABLE public.menu_items ADD COLUMN description_am TEXT;
    END IF;

    -- 2. Ensure desc_sid and description_sid exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'desc_sid'
    ) THEN
        ALTER TABLE public.menu_items ADD COLUMN desc_sid TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'description_sid'
    ) THEN
        ALTER TABLE public.menu_items ADD COLUMN description_sid TEXT;
    END IF;
END $$;

-- 3. Update synonym synchronization trigger function
CREATE OR REPLACE FUNCTION public.sync_menu_item_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Category synonym sync
        IF NEW.category IS NULL AND NEW.category_id IS NOT NULL THEN
            NEW.category := NEW.category_id;
        ELSIF NEW.category_id IS NULL AND NEW.category IS NOT NULL THEN
            NEW.category_id := NEW.category;
        END IF;

        -- English description synonym sync
        IF NEW.description IS NULL AND NEW."desc" IS NOT NULL THEN
            NEW.description := NEW."desc";
        ELSIF NEW."desc" IS NULL AND NEW.description IS NOT NULL THEN
            NEW."desc" := NEW.description;
        END IF;

        -- Amharic description synonym sync
        IF NEW.description_am IS NULL AND NEW.desc_am IS NOT NULL THEN
            NEW.description_am := NEW.desc_am;
        ELSIF NEW.desc_am IS NULL AND NEW.description_am IS NOT NULL THEN
            NEW.desc_am := NEW.description_am;
        END IF;

        -- Sidama description synonym sync
        IF NEW.description_sid IS NULL AND NEW.desc_sid IS NOT NULL THEN
            NEW.description_sid := NEW.desc_sid;
        ELSIF NEW.desc_sid IS NULL AND NEW.description_sid IS NOT NULL THEN
            NEW.desc_sid := NEW.description_sid;
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Category synonym sync
        IF NEW.category IS DISTINCT FROM OLD.category THEN
            NEW.category_id := NEW.category;
        ELSIF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
            NEW.category := NEW.category_id;
        END IF;

        -- English description synonym sync
        IF NEW.description IS DISTINCT FROM OLD.description THEN
            NEW."desc" := NEW.description;
        ELSIF NEW."desc" IS DISTINCT FROM OLD."desc" THEN
            NEW.description := NEW."desc";
        END IF;

        -- Amharic description synonym sync
        IF NEW.description_am IS DISTINCT FROM OLD.description_am THEN
            NEW.desc_am := NEW.description_am;
        ELSIF NEW.desc_am IS DISTINCT FROM OLD.desc_am THEN
            NEW.description_am := NEW.desc_am;
        END IF;

        -- Sidama description synonym sync
        IF NEW.description_sid IS DISTINCT FROM OLD.description_sid THEN
            NEW.desc_sid := NEW.description_sid;
        ELSIF NEW.desc_sid IS DISTINCT FROM OLD.desc_sid THEN
            NEW.description_sid := NEW.desc_sid;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Re-attach trigger
DROP TRIGGER IF EXISTS trg_sync_menu_item_columns ON public.menu_items;
CREATE TRIGGER trg_sync_menu_item_columns
    BEFORE INSERT OR UPDATE ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_menu_item_columns();

-- 5. Signal PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
