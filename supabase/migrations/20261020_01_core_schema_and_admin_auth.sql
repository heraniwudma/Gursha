-- ============================================================================
-- GURESHA CAFE MIGRATION 1 of 3: Core Schema & Admin Authorization
-- File: supabase/migrations/20261020_01_core_schema_and_admin_auth.sql
-- Status: PROPOSED — NOT YET EXECUTED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Starting Migration 20261020_01_core_schema_and_admin_auth...';
END $$;

-- 1. Create public.admin_users table if not exists
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure index on admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Ensure orders table columns match frontend contracts without data loss
DO $$
BEGIN
    -- Core identification & tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'guest_lookup_token') THEN
        ALTER TABLE public.orders ADD COLUMN guest_lookup_token TEXT;
    END IF;

    -- Financial & surcharge breakdown columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'subtotal') THEN
        ALTER TABLE public.orders ADD COLUMN subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_fee') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_charge') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'service_fee') THEN
        ALTER TABLE public.orders ADD COLUMN service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'service_charge') THEN
        ALTER TABLE public.orders ADD COLUMN service_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;

    -- Service & operational columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_type') THEN
        ALTER TABLE public.orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'dine_in';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'serving_choice') THEN
        ALTER TABLE public.orders ADD COLUMN serving_choice TEXT NOT NULL DEFAULT 'None';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'table_number') THEN
        ALTER TABLE public.orders ADD COLUMN table_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'delivery_address') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_address TEXT;
    END IF;

    -- Payment proof verification columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_image') THEN
        ALTER TABLE public.orders ADD COLUMN proof_image TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_status') THEN
        ALTER TABLE public.orders ADD COLUMN proof_status TEXT NOT NULL DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_rejection_reason') THEN
        ALTER TABLE public.orders ADD COLUMN proof_rejection_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_uploaded_at') THEN
        ALTER TABLE public.orders ADD COLUMN proof_uploaded_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_reviewed_at') THEN
        ALTER TABLE public.orders ADD COLUMN proof_reviewed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'proof_reviewed_by') THEN
        ALTER TABLE public.orders ADD COLUMN proof_reviewed_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Indexes for guest lookups and user orders
CREATE INDEX IF NOT EXISTS idx_orders_guest_lookup_token ON public.orders(guest_lookup_token) WHERE guest_lookup_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_code ON public.orders(code);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- 3. Ensure order_items table columns match requirements
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'extras') THEN
        ALTER TABLE public.order_items ADD COLUMN extras JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'serving_choice') THEN
        ALTER TABLE public.order_items ADD COLUMN serving_choice TEXT NOT NULL DEFAULT 'None';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'item_total') THEN
        ALTER TABLE public.order_items ADD COLUMN item_total NUMERIC(10,2) NOT NULL DEFAULT 0.00;
    END IF;
END $$;

-- 4. Seed store_settings for dynamic extras if missing (preserves existing custom settings)
CREATE TABLE IF NOT EXISTS public.store_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Insert complete catalog of 4 food extras + 3 drink add-ons ONLY IF key 'extras' does not already exist
INSERT INTO public.store_settings (key, value)
VALUES (
    'extras',
    jsonb_build_array(
        jsonb_build_object('id', 'extra-injera', 'name', 'Extra Injera', 'price', 20.00, 'category', 'food'),
        jsonb_build_object('id', 'extra-kita', 'name', 'Extra Kita', 'price', 25.00, 'category', 'food'),
        jsonb_build_object('id', 'boiled-egg', 'name', 'Boiled Egg', 'price', 20.00, 'category', 'food'),
        jsonb_build_object('id', 'ayib', 'name', 'Ayib (Cottage Cheese)', 'price', 30.00, 'category', 'food'),
        jsonb_build_object('id', 'ethiopian-coffee', 'name', 'Ethiopian Coffee', 'price', 25.00, 'category', 'drink'),
        jsonb_build_object('id', 'soft-drink', 'name', 'Soft Drink', 'price', 35.00, 'category', 'drink'),
        jsonb_build_object('id', 'ambo-water', 'name', 'Ambo Water', 'price', 30.00, 'category', 'drink')
    )
)
ON CONFLICT (key) DO NOTHING;

-- 5. Define public.is_admin()
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
          AND role = 'admin'
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Verifies if current authenticated user has an active record in public.admin_users';

-- Grants for is_admin: authenticated callers need to verify admin status
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 6. Define hardened public.bootstrap_first_admin(p_email text)
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_target_user_id UUID;
    v_clean_email TEXT;
    v_caller_role TEXT;
BEGIN
    -- Strict security guard: only allow direct database operators or service role
    v_caller_role := coalesce(current_setting('request.jwt.claim.role', true), '');
    
    IF session_user NOT IN ('postgres', 'supabase_admin') AND v_caller_role <> 'service_role' THEN
        RAISE EXCEPTION 'Access Denied: bootstrap_first_admin can only be executed by a database operator or service role';
    END IF;

    v_clean_email := lower(trim(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RAISE EXCEPTION 'Invalid email address provided';
    END IF;

    -- Lookup target user in auth.users
    SELECT id INTO v_target_user_id
    FROM auth.users
    WHERE lower(email) = v_clean_email;

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found in auth.users', v_clean_email;
    END IF;

    -- Insert into public.admin_users
    INSERT INTO public.admin_users (user_id, role)
    VALUES (v_target_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_user_id,
        'email', v_clean_email,
        'role', 'admin',
        'message', 'Administrator bootstrapped successfully'
    );
END;
$$;

COMMENT ON FUNCTION public.bootstrap_first_admin(TEXT) IS 'Bootstraps an administrator by email. Restricted strictly to postgres and service_role.';

-- Strictly revoke all public and API access from bootstrap_first_admin
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(TEXT) TO postgres, service_role;
