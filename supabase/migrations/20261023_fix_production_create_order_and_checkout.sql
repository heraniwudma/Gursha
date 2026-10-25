-- ============================================================================
-- GURESHA CAFE PRODUCTION CHECKOUT MIGRATION
-- File: supabase/migrations/20261023_fix_production_create_order_and_checkout.sql
-- Status: IDEMPOTENT & REVIEWED
-- Target Environment: Production (Project Ref: hiisvmovrlxgfsgtercn)
-- ============================================================================
-- Purpose:
-- 1. Restores the server-authoritative public.create_order(p_order jsonb, p_items jsonb) RPC.
-- 2. Calculates all item base prices, extras, Kita bread surcharges, delivery fees,
--    and 5% dine-in service charges on the server to prevent client tampering.
-- 3. Implements collision-safe order code generation under concurrent requests.
-- 4. Eliminates temporary tables in SECURITY DEFINER functions to prevent session hijacking.
-- 5. Preserves unauthenticated guest checkout with 48-char cryptographically secure tokens.
-- 6. Enforces strict validation: phone numbers, valid payment methods, delivery zones,
--    menu item availability, extras catalog adherence, and scheduled time constraints.
-- 7. Restores guest lookup and payment proof RPCs (get_guest_order, get_guest_orders,
--    submit_payment_proof) matching frontend contracts.
-- 8. Safe search_path (public, extensions, pg_temp) and least-privilege security model.
-- 9. Reloads PostgREST schema cache via NOTIFY pgrst.
-- ============================================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================================
-- 1. STORE SETTINGS & DYNAMIC CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

DROP POLICY IF EXISTS "store_settings_public_select" ON public.store_settings;

CREATE POLICY "store_settings_public_select"
ON public.store_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('extras', 'delivery', 'menu'));

-- Seed default dynamic extras catalog (drinks excluded) if not already configured
INSERT INTO public.store_settings (key, value)
VALUES (
    'extras',
    '[
        {"id":"extra-injera","name":"Extra injera","price":30,"enabled":true},
        {"id":"ayib-cheese","name":"Ayib cheese","price":45,"enabled":true},
        {"id":"boiled-egg","name":"Boiled egg","price":35,"enabled":true},
        {"id":"extra-awaze","name":"Extra awaze","price":20,"enabled":true}
    ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Remove standalone drinks from existing dish extras catalog while preserving custom admin extras
UPDATE public.store_settings
SET value = COALESCE((
    SELECT jsonb_agg(item)
    FROM jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(value) = 'array' THEN value
            ELSE '[]'::jsonb
        END
    ) AS item
    WHERE lower(trim(COALESCE(item->>'name', ''))) NOT IN
          ('ethiopian coffee', 'soft drink', 'ambo water')
      AND lower(trim(COALESCE(item->>'id', ''))) NOT IN
          ('ethiopian-coffee', 'soft-drink', 'ambo-water')
), '[]'::jsonb)
WHERE key = 'extras'
  AND jsonb_typeof(value) = 'array';

-- Seed default delivery destinations if not already configured
INSERT INTO public.store_settings (key, value)
VALUES (
    'delivery',
    '{
        "enabled": true,
        "destinations": [
            {"id":"main-campus","name":"Main Campus","distanceKm":2,"enabled":true},
            {"id":"techno-campus","name":"Techno Campus","distanceKm":4,"enabled":true}
        ]
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. ORDER TABLE COLUMNS & PERFORMANCE INDEXES
-- ============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS guest_lookup_token TEXT,
    ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'takeaway',
    ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS proof_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS proof_image TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS proof_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'placed',
    ADD COLUMN IF NOT EXISTS eta INTEGER NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS staff_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_code
    ON public.orders(code);

CREATE INDEX IF NOT EXISTS idx_orders_guest_lookup_token
    ON public.orders(guest_lookup_token)
    WHERE guest_lookup_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON public.orders(user_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
    ON public.orders(created_at DESC);

-- ============================================================================
-- 3. ORDER CODE GENERATOR
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_attempts INTEGER := 0;
BEGIN
    LOOP
        BEGIN
            v_code := 'GR-' || upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 4));
        EXCEPTION WHEN OTHERS THEN
            v_code := 'GR-' || upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 4));
        END;

        SELECT EXISTS (
            SELECT 1
            FROM public.orders
            WHERE code = v_code
        )
        INTO v_exists;

        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        v_attempts := v_attempts + 1;
        IF v_attempts > 20 THEN
            RETURN 'GR-' || upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 4)) || (extract(epoch from clock_timestamp())::bigint % 100)::text;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_order_code() IS 'Generates unique collision-checked order code in format GR-XXXX';

-- ============================================================================
-- 4. SERVER-AUTHORITATIVE CREATE_ORDER RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order(
    p_order JSONB,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_guest_token TEXT;
    v_order_id UUID;
    v_code TEXT;
    v_inserted BOOLEAN := FALSE;
    v_insert_attempt INTEGER;

    v_customer_name TEXT;
    v_phone TEXT;
    v_service_type TEXT;
    v_zone TEXT;
    v_address TEXT;
    v_payment_method TEXT;
    v_scheduled_for TIMESTAMPTZ;

    v_status TEXT;
    v_eta INTEGER;

    v_distance_km NUMERIC(6,2) := 0;
    v_delivery_fee NUMERIC(10,2) := 0;
    v_subtotal NUMERIC(10,2) := 0;
    v_service_charge NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;

    v_delivery_settings JSONB;
    v_destination JSONB;
    v_destination_found BOOLEAN := FALSE;
    v_destination_enabled BOOLEAN := TRUE;

    v_custom_menu JSONB;
    v_menu_item JSONB;
    v_extras_config JSONB;
    v_extra_obj JSONB;

    v_item JSONB;
    v_item_id TEXT;
    v_quantity INTEGER;
    v_item_name TEXT;
    v_base_price NUMERIC(10,2);
    v_in_stock BOOLEAN;

    v_base_choice TEXT;
    v_base_extra NUMERIC(10,2) := 0;

    v_spice INTEGER;
    v_extras TEXT[];
    v_seen_extras TEXT[];
    v_extra TEXT;
    v_normalized_extra TEXT;
    v_extra_matched BOOLEAN;
    v_extra_price NUMERIC(10,2);
    v_matched_name TEXT;
    v_matched_price NUMERIC(10,2);
    v_matched_enabled BOOLEAN;
    v_note TEXT;
    v_item_total NUMERIC(10,2);

    -- In-memory line item staging to avoid temporary-table reuse / hijacking
    v_validated_items JSONB := '[]'::jsonb;
BEGIN
    -- 1. Identity binding: derive user_id from active session if present
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        -- High-entropy 48-char random hex token for unauthenticated guest checkout
        v_guest_token := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48);
    ELSE
        v_guest_token := NULL;
    END IF;

    -- 2. Validate Order Header
    IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
        RAISE EXCEPTION 'Order payload must be a JSON object';
    END IF;

    v_customer_name := trim(COALESCE(p_order->>'customer_name', ''));
    v_phone := trim(COALESCE(p_order->>'phone', ''));
    v_service_type := lower(trim(COALESCE(p_order->>'service_type', '')));
    v_payment_method := lower(trim(COALESCE(p_order->>'payment_method', '')));
    v_zone := trim(COALESCE(p_order->>'zone', ''));
    v_address := trim(COALESCE(p_order->>'address', ''));

    IF char_length(v_customer_name) < 2 THEN
        RAISE EXCEPTION 'Customer name must be at least 2 characters';
    END IF;

    IF v_phone !~ '^(\+251[79]\d{8}|0[79]\d{8}|[79]\d{8})$' THEN
        RAISE EXCEPTION 'Invalid Ethiopian mobile phone number: "%". Expected format: 09XXXXXXXX, 07XXXXXXXX, or +251XXXXXXXXX', v_phone;
    END IF;

    -- Normalize service type ('dine-in', 'takeaway', 'delivery')
    IF v_service_type IN ('dine-in', 'dine_in') THEN
        v_service_type := 'dine-in';
    ELSIF v_service_type IN ('takeaway', 'pickup') THEN
        v_service_type := 'takeaway';
    ELSIF v_service_type = 'delivery' THEN
        v_service_type := 'delivery';
    ELSE
        RAISE EXCEPTION 'Invalid service type: "%". Allowed types: dine-in, takeaway, delivery', v_service_type;
    END IF;

    -- Normalize payment method
    IF v_payment_method IN ('cbe_birr', 'cbe') THEN
        v_payment_method := 'cbe';
    ELSIF v_payment_method = 'telebirr' THEN
        v_payment_method := 'telebirr';
    ELSIF v_payment_method = 'cash' THEN
        v_payment_method := 'cash';
    ELSE
        RAISE EXCEPTION 'Invalid payment method: "%". Allowed methods: cash, telebirr, cbe', v_payment_method;
    END IF;

    -- Validate optional scheduled time
    IF NULLIF(trim(COALESCE(p_order->>'scheduled_for', '')), '') IS NOT NULL THEN
        BEGIN
            v_scheduled_for := (p_order->>'scheduled_for')::timestamptz;
        EXCEPTION
            WHEN invalid_datetime_format OR datetime_field_overflow THEN
                RAISE EXCEPTION 'Invalid scheduled_for timestamp; use ISO-8601 format';
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid scheduled_for timestamp format';
        END;

        IF v_scheduled_for < now() - interval '5 minutes' THEN
            RAISE EXCEPTION 'Scheduled order time cannot be in the past';
        END IF;
    ELSE
        v_scheduled_for := NULL;
    END IF;

    -- Server-authoritative delivery calculations
    IF v_service_type = 'delivery' THEN
        IF v_zone = '' THEN
            RAISE EXCEPTION 'Delivery destination/zone is required for delivery orders';
        END IF;

        IF char_length(v_address) < 3 THEN
            RAISE EXCEPTION 'Delivery address is required for delivery orders';
        END IF;

        SELECT value INTO v_delivery_settings
        FROM public.store_settings
        WHERE key = 'delivery';

        IF v_delivery_settings IS NOT NULL AND (v_delivery_settings ? 'enabled') AND NOT (v_delivery_settings->>'enabled')::boolean THEN
            RAISE EXCEPTION 'Delivery service is currently disabled';
        END IF;

        IF v_delivery_settings IS NOT NULL AND jsonb_typeof(v_delivery_settings->'destinations') = 'array' THEN
            FOR v_destination IN SELECT value FROM jsonb_array_elements(v_delivery_settings->'destinations')
            LOOP
                IF lower(trim(COALESCE(v_destination->>'id', ''))) = lower(v_zone)
                   OR lower(trim(COALESCE(v_destination->>'name', ''))) = lower(v_zone)
                THEN
                    v_destination_found := TRUE;
                    v_destination_enabled := COALESCE((v_destination->>'enabled')::boolean, TRUE);
                    v_distance_km := COALESCE((v_destination->>'distanceKm')::numeric, 0);
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        -- Fallback for standard campuses if not explicitly configured in array
        IF NOT v_destination_found THEN
            IF lower(v_zone) LIKE '%techno%' THEN
                v_destination_found := TRUE;
                v_destination_enabled := TRUE;
                v_distance_km := 4;
            ELSIF lower(v_zone) LIKE '%main%' THEN
                v_destination_found := TRUE;
                v_destination_enabled := TRUE;
                v_distance_km := 2;
            ELSE
                RAISE EXCEPTION 'Unknown or invalid delivery destination: "%"', v_zone;
            END IF;
        END IF;

        IF NOT v_destination_enabled THEN
            RAISE EXCEPTION 'Delivery destination "%" is currently disabled', v_zone;
        END IF;

        IF v_distance_km < 0 THEN
            v_distance_km := 0;
        END IF;

        v_delivery_fee := 30 + (v_distance_km * 10);
    ELSE
        v_delivery_fee := 0;
        v_distance_km := 0;
    END IF;

    v_status := CASE WHEN v_payment_method = 'cash' THEN 'placed' ELSE 'payment_pending' END;
    v_eta := CASE v_service_type WHEN 'dine-in' THEN 20 WHEN 'takeaway' THEN 25 ELSE 40 END;

    -- 3. Load configurations from store_settings
    SELECT value INTO v_extras_config
    FROM public.store_settings
    WHERE key = 'extras';

    SELECT value INTO v_custom_menu
    FROM public.store_settings
    WHERE key = 'menu';

    -- 4. Validate Items Array
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
    END IF;

    IF jsonb_array_length(p_items) > 50 THEN
        RAISE EXCEPTION 'Order exceeds maximum permitted item count (50)';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Each order item must be a JSON object';
        END IF;

        v_item_id := trim(COALESCE(v_item->>'menu_item_id', v_item->>'id', ''));
        v_quantity := COALESCE((v_item->>'quantity')::integer, 0);

        IF v_quantity < 1 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Item quantity must be between 1 and 100 for item %', v_item_id;
        END IF;

        v_item_name := NULL;
        v_base_price := NULL;
        v_in_stock := TRUE;

        -- Check custom menu in store_settings first
        IF v_custom_menu IS NOT NULL AND jsonb_typeof(v_custom_menu) = 'array' THEN
            FOR v_menu_item IN SELECT value FROM jsonb_array_elements(v_custom_menu)
            LOOP
                IF lower(trim(COALESCE(v_menu_item->>'id', ''))) = lower(v_item_id) THEN
                    v_item_name := trim(COALESCE(v_menu_item->>'name', ''));
                    v_base_price := (v_menu_item->>'price')::numeric;
                    v_in_stock := COALESCE(
                        (v_menu_item->>'inStock')::boolean,
                        (v_menu_item->>'in_stock')::boolean,
                        TRUE
                    );
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        -- Fallback to public.menu_items table
        IF v_base_price IS NULL THEN
            SELECT name, price, in_stock
            INTO v_item_name, v_base_price, v_in_stock
            FROM public.menu_items
            WHERE lower(trim(id::text)) = lower(v_item_id);
        END IF;

        IF v_base_price IS NULL OR v_item_name IS NULL THEN
            RAISE EXCEPTION 'Invalid or unknown menu item: "%"', v_item_id;
        END IF;

        IF NOT COALESCE(v_in_stock, FALSE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently out of stock and cannot be ordered', v_item_name;
        END IF;

        -- Base Choice: Injera (+0), Kita bread / Bread (+25), None (+0)
        v_base_choice := COALESCE(v_item->>'base_choice', v_item->>'base', 'Injera');
        IF lower(trim(v_base_choice)) IN ('bread', 'kita bread', 'kita') THEN
            v_base_choice := 'Kita bread';
            v_base_extra := 25;
        ELSIF lower(trim(v_base_choice)) IN ('none', 'no base') THEN
            v_base_choice := 'No base';
            v_base_extra := 0;
        ELSIF lower(trim(v_base_choice)) IN ('injera', '') THEN
            v_base_choice := 'Injera';
            v_base_extra := 0;
        ELSE
            RAISE EXCEPTION 'Invalid base choice "%" for item %', v_base_choice, v_item_name;
        END IF;

        v_spice := COALESCE((v_item->>'spice_level')::integer, (v_item->>'spice')::integer, 0);
        IF v_spice < 0 OR v_spice > 3 THEN
            RAISE EXCEPTION 'Spice level must be between 0 and 3';
        END IF;

        v_note := left(trim(COALESCE(v_item->>'note', '')), 300);

        -- Extras validation
        v_extras := ARRAY[]::TEXT[];
        v_seen_extras := ARRAY[]::TEXT[];
        v_extra_price := 0;

        IF v_item ? 'extras' AND jsonb_typeof(v_item->'extras') = 'array' THEN
            FOR v_extra IN SELECT jsonb_array_elements_text(v_item->'extras')
            LOOP
                v_normalized_extra := lower(trim(v_extra));
                IF v_normalized_extra = '' THEN
                    CONTINUE;
                END IF;

                IF v_normalized_extra = ANY(v_seen_extras) THEN
                    RAISE EXCEPTION 'Duplicate extra option "%" on item %', v_extra, v_item_name;
                END IF;
                v_seen_extras := array_append(v_seen_extras, v_normalized_extra);

                v_extra_matched := FALSE;
                v_matched_name := NULL;
                v_matched_price := 0;
                v_matched_enabled := TRUE;

                -- 1. If store_settings extras catalog is configured, it is authoritative
                IF v_extras_config IS NOT NULL AND jsonb_typeof(v_extras_config) = 'array' THEN
                    FOR v_extra_obj IN SELECT value FROM jsonb_array_elements(v_extras_config)
                    LOOP
                        IF lower(trim(COALESCE(v_extra_obj->>'name', ''))) = v_normalized_extra
                           OR lower(trim(COALESCE(v_extra_obj->>'id', ''))) = replace(v_normalized_extra, ' ', '-')
                        THEN
                            v_extra_matched := TRUE;
                            v_matched_name := v_extra_obj->>'name';
                            v_matched_price := COALESCE((v_extra_obj->>'price')::numeric, 0);
                            v_matched_enabled := COALESCE((v_extra_obj->>'enabled')::boolean, TRUE);
                            EXIT;
                        END IF;
                    END LOOP;

                    IF v_extra_matched THEN
                        IF NOT v_matched_enabled THEN
                            RAISE EXCEPTION 'Extra "%" is currently disabled and cannot be selected', v_extra;
                        END IF;
                        v_extra_price := v_extra_price + v_matched_price;
                        v_extras := array_append(v_extras, v_matched_name);
                    ELSE
                        RAISE EXCEPTION 'Invalid food extra "%" for item %. Drinks and unconfigured items cannot be ordered as dish add-ons.', v_extra, v_item_name;
                    END IF;

                -- 2. Fallback to standard food extras ONLY when store_settings extras is unconfigured
                ELSIF v_normalized_extra IN ('extra injera', 'extra-injera') THEN
                    v_extra_price := v_extra_price + 30;
                    v_extras := array_append(v_extras, 'Extra injera');
                ELSIF v_normalized_extra IN ('ayib cheese', 'ayib', 'ayib (cottage cheese)') THEN
                    v_extra_price := v_extra_price + 45;
                    v_extras := array_append(v_extras, 'Ayib cheese');
                ELSIF v_normalized_extra IN ('boiled egg', 'boiled-egg') THEN
                    v_extra_price := v_extra_price + 35;
                    v_extras := array_append(v_extras, 'Boiled egg');
                ELSIF v_normalized_extra IN ('extra awaze', 'extra-awaze') THEN
                    v_extra_price := v_extra_price + 20;
                    v_extras := array_append(v_extras, 'Extra awaze');
                ELSE
                    RAISE EXCEPTION 'Invalid food extra "%" for item %. Drinks and unconfigured items cannot be ordered as dish add-ons.', v_extra, v_item_name;
                END IF;
            END LOOP;
        END IF;

        v_item_total := (v_base_price + v_base_extra + v_extra_price) * v_quantity;
        v_subtotal := v_subtotal + v_item_total;

        -- Store validated item into memory array (clean, no temporary table)
        v_validated_items := v_validated_items || jsonb_build_array(jsonb_build_object(
            'menu_item_id', v_item_id,
            'name', v_item_name,
            'base_price', v_base_price,
            'quantity', v_quantity,
            'base_choice', v_base_choice,
            'spice_level', v_spice,
            'extras', to_jsonb(v_extras),
            'extra_price', (v_base_extra + v_extra_price),
            'item_total', v_item_total,
            'note', v_note
        ));
    END LOOP;

    -- 5. Calculate summary financial totals server-side
    IF v_service_type = 'dine-in' THEN
        v_service_charge := round(v_subtotal * 0.05);
    ELSE
        v_service_charge := 0;
    END IF;

    v_total := v_subtotal + v_delivery_fee + v_service_charge;
    v_order_id := gen_random_uuid();

    -- 6. Insert Order Header with retry on order code collision under high concurrency
    FOR v_insert_attempt IN 1..10 LOOP
        v_code := public.generate_order_code();
        BEGIN
            INSERT INTO public.orders (
                id, code, user_id, guest_lookup_token,
                customer_name, phone, service_type, zone, distance_km,
                address, subtotal, delivery_fee, delivery_charge,
                service_fee, service_charge, total, payment_method,
                proof_status, proof_image, proof_note, status, eta,
                staff_note, scheduled_for, created_at
            )
            VALUES (
                v_order_id, v_code, v_user_id, v_guest_token,
                v_customer_name, v_phone, v_service_type, v_zone, v_distance_km,
                v_address, v_subtotal, v_delivery_fee, v_delivery_fee,
                v_service_charge, v_service_charge, v_total, v_payment_method,
                'none', '', '', v_status, v_eta,
                '', v_scheduled_for, timezone('utc', now())
            );
            v_inserted := TRUE;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            -- Generated code collided under concurrent checkout; loop generates a new code
        END;
    END LOOP;

    IF NOT v_inserted THEN
        RAISE EXCEPTION 'Could not generate a unique order code after multiple attempts';
    END IF;

    -- 7. Insert Order Items from in-memory validated array
    INSERT INTO public.order_items (
        id, order_id, menu_item_id, name, base_price,
        quantity, base_choice, spice_level, extras,
        extra_price, item_total, note, created_at
    )
    SELECT
        gen_random_uuid(),
        v_order_id,
        val->>'menu_item_id',
        val->>'name',
        (val->>'base_price')::numeric,
        (val->>'quantity')::integer,
        val->>'base_choice',
        (val->>'spice_level')::integer,
        ARRAY(SELECT jsonb_array_elements_text(val->'extras')),
        (val->>'extra_price')::numeric,
        (val->>'item_total')::numeric,
        val->>'note',
        timezone('utc', now())
    FROM jsonb_array_elements(v_validated_items) AS val;

    -- 8. Return response matching frontend create_order contract
    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'code', v_code,
        'total', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'delivery_charge', v_delivery_fee,
        'service_fee', v_service_charge,
        'service_charge', v_service_charge,
        'guest_lookup_token', v_guest_token,
        'status', v_status,
        'payment_method', v_payment_method,
        'created_at', timezone('utc', now())
    );
END;
$$;

COMMENT ON FUNCTION public.create_order(JSONB, JSONB) IS 'Authoritative order creation calculating all prices, surcharges, and totals server-side.';

REVOKE ALL ON FUNCTION public.create_order(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, JSONB) TO anon, authenticated, service_role;

-- ============================================================================
-- 5. GUEST ORDER LOOKUP & PAYMENT PROOF RPCS
-- ============================================================================

-- Single guest order lookup: requires order code and secret guest lookup token
CREATE OR REPLACE FUNCTION public.get_guest_order(
    p_code TEXT,
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
STABLE
AS $$
DECLARE
    v_order JSONB;
    v_items JSONB;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' OR length(trim(p_token)) < 16 OR p_code IS NULL OR trim(p_code) = '' THEN
        RETURN NULL;
    END IF;

    -- Customer-facing fields only; never expose secret guest_lookup_token or user_id
    SELECT jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'created_at', o.created_at,
        'scheduled_for', o.scheduled_for,
        'customer_name', o.customer_name,
        'phone', o.phone,
        'service_type', o.service_type,
        'zone', o.zone,
        'distance_km', o.distance_km,
        'address', o.address,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'delivery_charge', o.delivery_charge,
        'service_fee', o.service_fee,
        'service_charge', o.service_charge,
        'total', o.total,
        'payment_method', o.payment_method,
        'proof_status', o.proof_status,
        'proof_image', o.proof_image,
        'proof_note', o.proof_note,
        'status', o.status,
        'eta', o.eta,
        'staff_note', o.staff_note
    ) INTO v_order
    FROM public.orders o
    WHERE o.code = trim(p_code)
      AND o.guest_lookup_token IS NOT NULL
      AND o.guest_lookup_token = trim(p_token);

    IF v_order IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'order_id', oi.order_id,
        'menu_item_id', oi.menu_item_id,
        'name', oi.name,
        'base_price', oi.base_price,
        'quantity', oi.quantity,
        'base_choice', oi.base_choice,
        'spice_level', oi.spice_level,
        'extras', oi.extras,
        'extra_price', oi.extra_price,
        'item_total', oi.item_total,
        'note', oi.note
    )), '[]'::jsonb) INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = (v_order->>'id')::uuid;

    -- Matches frontend GurshaStore contract: data.order and data.items
    RETURN jsonb_build_object(
        'order', v_order,
        'items', v_items
    );
END;
$$;

COMMENT ON FUNCTION public.get_guest_order(TEXT, TEXT) IS 'Retrieves guest order with valid code and secret token without leaking user_id or secret token.';

REVOKE ALL ON FUNCTION public.get_guest_order(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_order(TEXT, TEXT) TO anon, authenticated, service_role;

-- Batch guest orders lookup: routine polling (capped at 25 orders)
-- Excludes heavy proof_image to protect client bandwidth and eliminate exposure of storage paths in polling
CREATE OR REPLACE FUNCTION public.get_guest_orders(
    p_orders JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
STABLE
AS $$
DECLARE
    v_item JSONB;
    v_code TEXT;
    v_token TEXT;
    v_order JSONB;
    v_items JSONB;
    v_results JSONB := '[]'::jsonb;
BEGIN
    IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
        RETURN '[]'::jsonb;
    END IF;

    IF jsonb_array_length(p_orders) > 25 THEN
        RAISE EXCEPTION 'Batch lookup limit is 25 orders';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_orders)
    LOOP
        v_code := trim(COALESCE(v_item->>'code', ''));
        v_token := trim(COALESCE(v_item->>'token', ''));

        IF v_code <> '' AND v_token <> '' AND length(v_token) >= 16 THEN
            SELECT jsonb_build_object(
                'id', o.id,
                'code', o.code,
                'created_at', o.created_at,
                'scheduled_for', o.scheduled_for,
                'customer_name', o.customer_name,
                'phone', o.phone,
                'service_type', o.service_type,
                'zone', o.zone,
                'distance_km', o.distance_km,
                'address', o.address,
                'subtotal', o.subtotal,
                'delivery_fee', o.delivery_fee,
                'delivery_charge', o.delivery_charge,
                'service_fee', o.service_fee,
                'service_charge', o.service_charge,
                'total', o.total,
                'payment_method', o.payment_method,
                'proof_status', o.proof_status,
                'proof_image', '', -- Excluded in batch polling
                'proof_note', o.proof_note,
                'status', o.status,
                'eta', o.eta,
                'staff_note', o.staff_note
            ) INTO v_order
            FROM public.orders o
            WHERE o.code = v_code
              AND o.guest_lookup_token IS NOT NULL
              AND o.guest_lookup_token = v_token;

            IF v_order IS NOT NULL THEN
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', oi.id,
                    'order_id', oi.order_id,
                    'menu_item_id', oi.menu_item_id,
                    'name', oi.name,
                    'base_price', oi.base_price,
                    'quantity', oi.quantity,
                    'base_choice', oi.base_choice,
                    'spice_level', oi.spice_level,
                    'extras', oi.extras,
                    'extra_price', oi.extra_price,
                    'item_total', oi.item_total,
                    'note', oi.note
                )), '[]'::jsonb) INTO v_items
                FROM public.order_items oi
                WHERE oi.order_id = (v_order->>'id')::uuid;

                v_results := v_results || jsonb_build_array(jsonb_build_object(
                    'order', v_order,
                    'items', v_items
                ));
            END IF;
        END IF;
    END LOOP;

    RETURN v_results;
END;
$$;

COMMENT ON FUNCTION public.get_guest_orders(JSONB) IS 'Batch lookup for guest orders by code and token, excluding heavy proof_image payloads.';

REVOKE ALL ON FUNCTION public.get_guest_orders(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_orders(JSONB) TO anon, authenticated, service_role;

-- Submit payment proof RPC
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_code TEXT,
    p_token TEXT,
    p_image TEXT,
    p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    SELECT id, user_id, guest_lookup_token, proof_status, status
    INTO v_order
    FROM public.orders
    WHERE code = trim(p_code);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order with code % not found', p_code;
    END IF;

    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot submit payment proof for cancelled order %', p_code;
    END IF;

    -- Authorize caller: either registered owner via auth.uid(), or guest holder of matching secret token
    IF v_order.user_id IS NOT NULL THEN
        IF v_user_id IS NULL OR v_user_id <> v_order.user_id THEN
            RAISE EXCEPTION 'Access Denied: Not authorized to upload proof for order %', p_code;
        END IF;
    ELSE
        IF p_token IS NULL OR trim(p_token) <> v_order.guest_lookup_token THEN
            RAISE EXCEPTION 'Access Denied: Invalid guest order authorization token';
        END IF;
    END IF;

    UPDATE public.orders
    SET proof_image = trim(p_image),
        proof_note = COALESCE(trim(p_note), proof_note),
        proof_status = 'pending'
    WHERE id = v_order.id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) IS 'Allows guest or customer order owners to submit payment proof images.';

REVOKE ALL ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- 6. REFRESH POSTGREST SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';