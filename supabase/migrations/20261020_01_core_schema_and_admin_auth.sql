-- ============================================================================
-- GURSHA CAFE MIGRATION 1 of 3: Core Schema & Admin Authorization
-- File: supabase/migrations/20261020_01_core_schema_and_admin_auth.sql
-- Status: REVISED & HARDENED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================
-- Summary of Changes:
-- 1. Idempotent table & column synchronization matching actual frontend contracts (UUID IDs,
--    service_type, address, proof_note, base_choice, base_price, extras text[]).
-- 2. Non-destructive column harmonization preserving existing values and financial aliases.
-- 3. Non-destructive menu item description & category synchronization trigger.
-- 4. Store settings dynamic catalog seeding (ON CONFLICT DO NOTHING to preserve custom settings).
-- 5. Hardened admin authorization: public.is_admin(), public.check_is_admin_email().
-- 6. Hardened bootstrap_first_admin restricted strictly to direct database operators
--    (postgres / supabase_admin) or backend service_role, explicitly barring API callers.
-- ============================================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Ensure standard Supabase roles exist if running in local test or standalone Postgres
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Base Operational & Reference Tables
-- ----------------------------------------------------------------------------

-- Ensure public.admin_users table exists with email and user_id UUID
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure columns exist if table was previously created with different schema
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Ensure indices on admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- Ensure public.store_settings table exists
CREATE TABLE IF NOT EXISTS public.store_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure public.menu_items table exists
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_am TEXT,
    name_sid TEXT,
    description TEXT,
    "desc" TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    category TEXT NOT NULL,
    category_id TEXT,
    image TEXT,
    spice INTEGER DEFAULT 0,
    rating NUMERIC(3,1) DEFAULT 5.0,
    popular BOOLEAN DEFAULT false,
    fasting BOOLEAN DEFAULT false,
    in_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure columns exist on menu_items
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS name_am TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS name_sid TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS spice INTEGER DEFAULT 0;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS rating NUMERIC(3,1) DEFAULT 5.0;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS popular BOOLEAN DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS fasting BOOLEAN DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Ensure description columns are nullable (preserving 20261015 migration)
ALTER TABLE public.menu_items ALTER COLUMN description DROP NOT NULL;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'desc'
    ) THEN
        ALTER TABLE public.menu_items ALTER COLUMN "desc" DROP NOT NULL;
    END IF;
END $$;

-- Synchronize menu item synonym columns non-destructively
CREATE OR REPLACE FUNCTION public.sync_menu_item_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.category IS NULL AND NEW.category_id IS NOT NULL THEN
            NEW.category := NEW.category_id;
        ELSIF NEW.category_id IS NULL AND NEW.category IS NOT NULL THEN
            NEW.category_id := NEW.category;
        END IF;

        IF NEW.description IS NULL AND NEW."desc" IS NOT NULL THEN
            NEW.description := NEW."desc";
        ELSIF NEW."desc" IS NULL AND NEW.description IS NOT NULL THEN
            NEW."desc" := NEW.description;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.category IS DISTINCT FROM OLD.category THEN
            NEW.category_id := NEW.category;
        ELSIF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
            NEW.category := NEW.category_id;
        END IF;

        IF NEW.description IS DISTINCT FROM OLD.description THEN
            NEW."desc" := NEW.description;
        ELSIF NEW."desc" IS DISTINCT FROM OLD."desc" THEN
            NEW.description := NEW."desc";
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_menu_item_columns ON public.menu_items;
CREATE TRIGGER trg_sync_menu_item_columns
    BEFORE INSERT OR UPDATE ON public.menu_items
    FOR EACH ROW EXECUTE FUNCTION public.sync_menu_item_columns();

-- Ensure public.orders table exists (UUID primary key matching frontend data contract)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_lookup_token TEXT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'takeaway',
    zone TEXT NOT NULL DEFAULT '',
    distance_km NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    address TEXT NOT NULL DEFAULT '',
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    service_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    proof_status TEXT NOT NULL DEFAULT 'none',
    proof_image TEXT NOT NULL DEFAULT '',
    proof_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'placed',
    eta INTEGER NOT NULL DEFAULT 25,
    staff_note TEXT NOT NULL DEFAULT '',
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Idempotent column additions for public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_lookup_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'takeaway';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS proof_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS proof_image TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS proof_note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'placed';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS eta INTEGER NOT NULL DEFAULT 25;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS staff_note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Financial and service synonym backfill to guarantee zero NULL violations
UPDATE public.orders SET delivery_charge = delivery_fee WHERE (delivery_charge IS NULL OR delivery_charge = 0) AND delivery_fee > 0;
UPDATE public.orders SET delivery_fee = delivery_charge WHERE (delivery_fee IS NULL OR delivery_fee = 0) AND delivery_charge > 0;
UPDATE public.orders SET service_fee = service_charge WHERE (service_fee IS NULL OR service_fee = 0) AND service_charge > 0;
UPDATE public.orders SET service_charge = service_fee WHERE (service_charge IS NULL OR service_charge = 0) AND service_fee > 0;

-- Indices on public.orders for fast lookup
CREATE INDEX IF NOT EXISTS idx_orders_code ON public.orders(code);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_guest_lookup_token ON public.orders(guest_lookup_token) WHERE guest_lookup_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Ensure public.order_items table exists
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1,
    base_choice TEXT NOT NULL DEFAULT 'Injera',
    spice_level INTEGER NOT NULL DEFAULT 0,
    extras TEXT[] NOT NULL DEFAULT '{}'::text[],
    extra_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    item_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS menu_item_id TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS base_choice TEXT NOT NULL DEFAULT 'Injera';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS spice_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS extras TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS extra_price NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS item_total NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- Ensure public.profiles table exists
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Ensure public.customer_sessions table exists
CREATE TABLE IF NOT EXISTS public.customer_sessions (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    otp TEXT,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 2. Non-Destructive Store Settings Seeding
-- ----------------------------------------------------------------------------

-- Seed default dynamic extras catalog ONLY IF NOT PRESENT (never overwrites custom admin settings)
INSERT INTO public.store_settings (key, value)
VALUES (
    'extras',
    '[
        {"id": "extra-injera", "name": "Extra injera", "price": 30, "enabled": true},
        {"id": "ayib-cheese", "name": "Ayib cheese", "price": 45, "enabled": true},
        {"id": "boiled-egg", "name": "Boiled egg", "price": 35, "enabled": true},
        {"id": "extra-awaze", "name": "Extra awaze", "price": 20, "enabled": true}
    ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed default delivery destinations ONLY IF NOT PRESENT
INSERT INTO public.store_settings (key, value)
VALUES (
    'delivery',
    '{
        "enabled": true,
        "destinations": [
            {"id": "main-campus", "name": "Main Campus", "distanceKm": 2, "enabled": true},
            {"id": "techno-campus", "name": "Techno Campus", "distanceKm": 4, "enabled": true}
        ]
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed default dishes ONLY IF NOT PRESENT
INSERT INTO public.menu_items (id, name, price, category, category_id, description, "desc", fasting, in_stock) VALUES
    ('doro', 'Special Doro Wat', 420.00, 'mains', 'mains', 'Slow-simmered chicken in aged berbere with a farm egg and ayib.', 'Slow-simmered chicken in aged berbere with a farm egg and ayib.', false, true),
    ('kitfo', 'Special Kitfo', 520.00, 'mains', 'mains', 'Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.', 'Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.', false, true),
    ('siga', 'Siga Tibs', 460.00, 'mains', 'mains', 'Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.', 'Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.', false, true),
    ('fish', 'Hawassa Asa Tibs', 480.00, 'fish', 'fish', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', false, true),
    ('chechebsa', 'Chechebsa', 190.00, 'breakfast', 'breakfast', 'Shredded kita in spiced butter and berbere with a drizzle of honey.', 'Shredded kita in spiced butter and berbere with a drizzle of honey.', false, true),
    ('firfir', 'Quanta Firfir', 260.00, 'breakfast', 'breakfast', 'Dried beef torn into warm berbere sauce with injera.', 'Dried beef torn into warm berbere sauce with injera.', false, true),
    ('shiro', 'Shiro Tegabino', 190.00, 'fasting', 'fasting', 'Silky chickpea stew with garlic, ginger and ground chili.', 'Silky chickpea stew with garlic, ginger and ground chili.', true, true),
    ('gomen', 'Gomen be Siga', 240.00, 'fasting', 'fasting', 'Collard greens braised with beef and cardamom.', 'Collard greens braised with beef and cardamom.', false, true),
    ('gomenkai', 'Fasting Combo', 300.00, 'fasting', 'fasting', 'Shiro, gomen, misir wot and salad on one injera platter.', 'Shiro, gomen, misir wot and salad on one injera platter.', true, true),
    ('buna', 'Buna Ceremony (Jebena)', 160.00, 'drinks', 'drinks', 'Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.', 'Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.', true, true),
    ('macchiato', 'Gursha Macchiato', 90.00, 'drinks', 'drinks', 'Double espresso with steamed milk, Sidaama sweetener.', 'Double espresso with steamed milk, Sidaama sweetener.', true, true),
    ('tej', 'Tej Honey Cooler', 150.00, 'drinks', 'drinks', 'Fermented honey refresher served over ice with lemon.', 'Fermented honey refresher served over ice with lemon.', true, false),
    ('spris', 'Avocado Spris', 130.00, 'juice', 'juice', 'Layered avocado and mango with lime, served with a spoon.', 'Layered avocado and mango with lime, served with a spoon.', true, true),
    ('mango', 'Mango Juice', 110.00, 'juice', 'juice', 'Fresh pressed mango, no sugar added.', 'Fresh pressed mango, no sugar added.', true, true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Administrator Authorization Functions
-- ----------------------------------------------------------------------------

-- public.is_admin(): Authoritatively checks if currently authenticated caller is in public.admin_users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Verifies if current authenticated user has an active record in public.admin_users';

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- public.check_is_admin_email(p_email): Safe pre-login check returning boolean only
CREATE OR REPLACE FUNCTION public.check_is_admin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE lower(email) = lower(trim(p_email))
    );
$$;

COMMENT ON FUNCTION public.check_is_admin_email(TEXT) IS 'Returns boolean confirming whether an email is registered as an admin. Safe for pre-auth verification.';

REVOKE ALL ON FUNCTION public.check_is_admin_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_is_admin_email(TEXT) TO anon, authenticated, service_role;

-- Trigger to protect public.admin_users table against unauthorized direct modifications
CREATE OR REPLACE FUNCTION public.protect_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_uid UUID;
BEGIN
    v_role := coalesce(auth.role(), '');
    v_uid := auth.uid();

    -- Allow direct database superusers or migration runners (postgres, supabase_admin)
    IF session_user IN ('postgres', 'supabase_admin') AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Allow backend service_role
    IF v_role = 'service_role' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- For API users: Must be authenticated and must already be an authorized admin
    IF v_uid IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: only verified administrators can modify admin_users';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_users ON public.admin_users;
CREATE TRIGGER trg_protect_admin_users
    BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
    FOR EACH ROW EXECUTE FUNCTION public.protect_admin_users();

-- ----------------------------------------------------------------------------
-- 4. Hardened Initial Administrator Bootstrap
-- ----------------------------------------------------------------------------

-- Overload 1: Bootstrap by Email
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_target_user_id UUID;
    v_clean_email TEXT;
    v_actual_email TEXT;
    v_caller_role TEXT;
BEGIN
    v_caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

    -- Strict execution context check: Only direct database operators or backend service_role
    IF session_user NOT IN ('postgres', 'supabase_admin') AND v_caller_role <> 'service_role' THEN
        RAISE EXCEPTION 'Access Denied: bootstrap_first_admin can only be executed by a direct database operator or service_role';
    END IF;

    -- Explicitly disallow API callers (anon or authenticated)
    IF v_caller_role IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Access Denied: API users cannot invoke bootstrap_first_admin';
    END IF;

    v_clean_email := lower(trim(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'A valid email address is required';
    END IF;

    -- Lookup user in auth.users
    SELECT id, email INTO v_target_user_id, v_actual_email
    FROM auth.users
    WHERE lower(email) = v_clean_email;

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found in auth.users. The user must register first.', v_clean_email;
    END IF;

    -- Upsert into public.admin_users
    INSERT INTO public.admin_users (user_id, email, role, created_at)
    VALUES (v_target_user_id, coalesce(v_actual_email, v_clean_email), 'admin', timezone('utc'::text, now()))
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        role = 'admin';

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_user_id,
        'email', v_clean_email,
        'role', 'admin',
        'message', 'Administrator bootstrapped successfully'
    );
END;
$$;

-- Overload 2: Bootstrap by UUID
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_caller_role TEXT;
BEGIN
    v_caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');

    IF session_user NOT IN ('postgres', 'supabase_admin') AND v_caller_role <> 'service_role' THEN
        RAISE EXCEPTION 'Access Denied: bootstrap_first_admin can only be executed by a direct database operator or service_role';
    END IF;

    IF v_caller_role IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Access Denied: API users cannot invoke bootstrap_first_admin';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'A valid user UUID is required';
    END IF;

    SELECT email INTO v_clean_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_clean_email IS NULL THEN
        RAISE EXCEPTION 'User ID % not found in auth.users', p_user_id;
    END IF;

    INSERT INTO public.admin_users (user_id, email, role, created_at)
    VALUES (p_user_id, lower(trim(v_clean_email)), 'admin', timezone('utc'::text, now()))
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        role = 'admin';

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'email', v_clean_email,
        'role', 'admin',
        'message', 'Administrator bootstrapped successfully'
    );
END;
$$;

COMMENT ON FUNCTION public.bootstrap_first_admin(TEXT) IS 'Bootstraps an administrator by email. Restricted strictly to direct database operator and service_role.';
COMMENT ON FUNCTION public.bootstrap_first_admin(UUID) IS 'Bootstraps an administrator by UUID. Restricted strictly to direct database operator and service_role.';

-- Strictly revoke all public and API access from bootstrap_first_admin
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(TEXT) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.bootstrap_first_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(UUID) TO postgres, service_role;
