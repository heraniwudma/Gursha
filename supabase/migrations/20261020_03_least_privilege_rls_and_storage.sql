-- ============================================================================
-- GURSHA CAFE MIGRATION 3 of 3: Least-Privilege RLS & Storage Hardening
-- File: supabase/migrations/20261020_03_least_privilege_rls_and_storage.sql
-- Status: REVISED & HARDENED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================
-- Summary of Changes:
-- 1. Enables RLS on all application and reference tables.
-- 2. Restricts direct table grants: anon cannot directly query orders/order_items/admin_users
--    (operating strictly through security-definer RPCs with input validation).
-- 3. Configures Row-Level Security policies ensuring customer isolation (user_id = auth.uid())
--    and administrator access (public.is_admin()).
-- 4. Storage Setup & Hardening:
--    - Explicit private bucket configuration without blanket exception suppression.
--    - 5MB file size limit and restricted MIME types (image/jpeg, image/png, image/webp).
--    - Multi-factor upload authorization associating proof uploads with active orders,
--      preventing arbitrary file uploads and preventing unauthenticated uploads to registered users' orders.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Least-Privilege Table Grants
-- ----------------------------------------------------------------------------

-- Orders: Revoke public/anon direct table access; authenticated customers can SELECT their own orders; admins manage via RLS
REVOKE ALL ON TABLE public.orders FROM PUBLIC;
REVOKE ALL ON TABLE public.orders FROM anon;
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

-- Order Items: Revoke public/anon direct table access; authenticated customers can SELECT items for their own orders
REVOKE ALL ON TABLE public.order_items FROM PUBLIC;
REVOKE ALL ON TABLE public.order_items FROM anon;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;

-- Admin Users: Direct access strictly revoked from public/anon; authenticated users can only query their own user_id or admin rows
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_users FROM anon;
GRANT SELECT ON TABLE public.admin_users TO authenticated;
GRANT ALL ON TABLE public.admin_users TO service_role;

-- Menu Items & Store Settings: Public read access for customer app; admin write access governed by RLS
GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;

GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

-- Profiles: Authenticated users manage own profile
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- Customer Sessions: Active session management for OTP verification
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_sessions TO anon, authenticated;
GRANT ALL ON TABLE public.customer_sessions TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security Policies for public.orders
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_update" ON public.orders;
DROP POLICY IF EXISTS "Allow anonymous order creation" ON public.orders;
DROP POLICY IF EXISTS "Public can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;

-- Verified administrators have full management access to all orders
CREATE POLICY "orders_admin_all"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Authenticated customers can view strictly their own orders
CREATE POLICY "orders_customer_select"
ON public.orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security Policies for public.order_items
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_customer_select" ON public.order_items;
DROP POLICY IF EXISTS "Admins have full access to order items" ON public.order_items;
DROP POLICY IF EXISTS "Customers can view own order items" ON public.order_items;

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

-- ----------------------------------------------------------------------------
-- 5. Row-Level Security Policies for public.menu_items
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "menu_items_public_select" ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_admin_manage" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can manage menu items" ON public.menu_items;

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

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security Policies for public.store_settings
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "store_settings_public_select" ON public.store_settings;
DROP POLICY IF EXISTS "store_settings_admin_manage" ON public.store_settings;
DROP POLICY IF EXISTS "Anyone can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can manage store settings" ON public.store_settings;

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

-- ----------------------------------------------------------------------------
-- 7. Row-Level Security Policies for public.admin_users
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_users_admin_select" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_manage" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_self_select" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;

-- Authenticated users can check their own admin status; admins can view all admin records
CREATE POLICY "admin_users_self_select"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- Only verified administrators can modify admin_users (further protected by trigger)
CREATE POLICY "admin_users_admin_manage"
ON public.admin_users
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. Row-Level Security Policies for public.profiles & customer_sessions
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_customer_manage" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;

CREATE POLICY "profiles_customer_manage"
ON public.profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "customer_sessions_access" ON public.customer_sessions;
CREATE POLICY "customer_sessions_access"
ON public.customer_sessions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 9. Storage Configuration & Hardened Policies for payment-proofs
-- ----------------------------------------------------------------------------

-- Verify / configure private storage bucket WITHOUT blanket exception suppression
-- Any schema or constraint failure will be immediately visible to the migration runner
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false,
    5242880, -- 5 MB binary limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing storage policies on payment-proofs
DROP POLICY IF EXISTS "Admin full access to payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins have full access to payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customer read own payment proof" ON storage.objects;
DROP POLICY IF EXISTS "Customers can view own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Upload payment proof with order association" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload to payment-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated payment proof uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public payment proof uploads" ON storage.objects;

-- Policy 1: Verified administrators have full management access
CREATE POLICY "Admin full access to payment proofs"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'payment-proofs' AND public.is_admin())
WITH CHECK (bucket_id = 'payment-proofs' AND public.is_admin());

-- Policy 2: Authenticated customers can read payment proofs associated with their own orders
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

-- Policy 3: Hardened upload authorization associated with an active authorized order
-- Enforces:
-- 1. Valid image file extension (jpg, jpeg, png, webp)
-- 2. Filename prefix matches an existing order code
-- 3. Order is currently active (not completed or cancelled)
-- 4. Order proof status allows submission (none, pending, rejected)
-- 5. If order belongs to a registered customer, anonymous users cannot upload to it
CREATE POLICY "Upload payment proof with order association"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (
        lower(split_part(storage.objects.name, '.', array_length(string_to_array(storage.objects.name, '.'), 1))) = ANY(ARRAY['jpg', 'jpeg', 'png', 'webp'])
    )
    AND EXISTS (
        SELECT 1
        FROM public.orders
        WHERE orders.code = split_part(storage.objects.name, '_', 1)
          AND orders.status NOT IN ('completed', 'cancelled')
          AND orders.proof_status IN ('none', 'pending', 'rejected')
          AND (
              -- If order is an unauthenticated guest order: allowed during active submission window
              (orders.user_id IS NULL)
              -- If order belongs to a registered user: only the authenticated owner can upload
              OR (auth.uid() IS NOT NULL AND orders.user_id = auth.uid())
              -- Verified administrators can upload for any order
              OR (public.is_admin())
          )
    )
);
