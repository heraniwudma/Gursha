-- ============================================================================
-- GURESHA CAFE MIGRATION 3 of 3: Least-Privilege RLS & Storage Hardening
-- File: supabase/migrations/20261020_03_least_privilege_rls_and_storage.sql
-- Status: PROPOSED — NOT YET EXECUTED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================

-- 1. Enable RLS on all operational and reference tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Restrict direct table grants (Least Privilege)
-- Revoke insecure public access; anonymous access to orders operates strictly via RPCs
REVOKE ALL ON TABLE public.orders FROM PUBLIC;
REVOKE ALL ON TABLE public.orders FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

REVOKE ALL ON TABLE public.order_items FROM PUBLIC;
REVOKE ALL ON TABLE public.order_items FROM anon;
GRANT SELECT, INSERT ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;

REVOKE ALL ON TABLE public.admin_users FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_users FROM anon;
GRANT SELECT ON TABLE public.admin_users TO authenticated;
GRANT ALL ON TABLE public.admin_users TO service_role;

-- Allow public read of menu and store settings
GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;

GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

-- 3. Row Level Security Policies for public.orders
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_update" ON public.orders;
DROP POLICY IF EXISTS "Allow anonymous order creation" ON public.orders;
DROP POLICY IF EXISTS "Public can view own orders" ON public.orders;

CREATE POLICY "orders_admin_all"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "orders_customer_select"
ON public.orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "orders_customer_insert"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders_customer_update"
ON public.orders
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 4. Row Level Security Policies for public.order_items
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_customer_select" ON public.order_items;

CREATE POLICY "order_items_admin_all"
ON public.order_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "order_items_customer_select"
ON public.order_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.orders
        WHERE orders.id = order_items.order_id
          AND orders.user_id = auth.uid()
    )
);

-- 5. Row Level Security Policies for public.menu_items
DROP POLICY IF EXISTS "menu_items_public_select" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_admin_manage" ON public.menu_items;

CREATE POLICY "menu_items_public_select"
ON public.menu_items
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "menu_items_admin_manage"
ON public.menu_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 6. Row Level Security Policies for public.store_settings
DROP POLICY IF EXISTS "store_settings_public_select" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_manage" ON public.store_settings;

CREATE POLICY "store_settings_public_select"
ON public.store_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "store_settings_admin_manage"
ON public.store_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 7. Row Level Security Policies for public.admin_users
DROP POLICY IF EXISTS "admin_users_admin_select" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_manage" ON public.admin_users;

CREATE POLICY "admin_users_admin_select"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "admin_users_admin_manage"
ON public.admin_users
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8. Storage Configuration & Hardened Policies for payment-proofs
-- Explicit bucket verification without error swallowing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'payment-proofs',
            'payment-proofs',
            false,
            5242880, -- 5 MB limit
            ARRAY['image/jpeg', 'image/png', 'image/webp']
        );
        RAISE NOTICE 'Bucket payment-proofs created successfully as private.';
    ELSE
        -- Ensure private visibility and file restrictions
        UPDATE storage.buckets
        SET public = false,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
        WHERE id = 'payment-proofs';
        RAISE NOTICE 'Bucket payment-proofs configuration verified.';
    END IF;
END $$;

-- Drop existing storage policies on payment-proofs
DROP POLICY IF EXISTS "Admin full access to payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customer read own payment proof" ON storage.objects;
DROP POLICY IF EXISTS "Upload payment proof with order association" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated payment proof uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public payment proof uploads" ON storage.objects;

-- Admin full access to storage
CREATE POLICY "Admin full access to payment proofs"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'payment-proofs' AND public.is_admin())
WITH CHECK (bucket_id = 'payment-proofs' AND public.is_admin());

-- Customer read own payment proof
CREATE POLICY "Customer read own payment proof"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-proofs'
    AND EXISTS (
        SELECT 1
        FROM public.orders
        WHERE orders.code = split_part(storage.objects.name, '_', 1)
          AND orders.user_id = auth.uid()
    )
);

-- Upload policy: validates order code prefix and pending proof status
CREATE POLICY "Upload payment proof with order association"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
    bucket_id = 'payment-proofs'
    AND EXISTS (
        SELECT 1
        FROM public.orders
        WHERE orders.code = split_part(storage.objects.name, '_', 1)
          AND orders.proof_status IN ('pending', 'rejected')
          AND (
              -- If caller is authenticated, either they own the order or are an admin
              auth.uid() IS NULL
              OR orders.user_id = auth.uid()
              OR public.is_admin()
          )
    )
);
