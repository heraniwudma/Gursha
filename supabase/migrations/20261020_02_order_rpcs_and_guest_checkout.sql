-- ============================================================================
-- GURSHA CAFE MIGRATION 2 of 3: Order RPCs & Guest Checkout
-- File: supabase/migrations/20261020_02_order_rpcs_and_guest_checkout.sql
-- Status: REVISED & HARDENED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================
-- Summary of Changes:
-- 1. Matches exact frontend RPC contract: create_order(p_order jsonb, p_items jsonb).
-- 2. Calculates all item totals, delivery fees, service charges, and grand totals server-side
--    using authoritative store_settings (keys 'extras', 'delivery', 'menu') and menu_items.
-- 3. Strict validation: normalizes serving choice (Injera, Kita bread/Bread +25, None),
--    rejects duplicate extras (case-insensitive), rejects disabled or uncatalogued extras,
--    and rejects negative or tampered values.
-- 4. High-entropy 48-char hex tokens for guest checkout isolation; registered users bind to auth.uid().
-- 5. get_guest_order and get_guest_orders RPCs return { order, items } matching frontend types,
--    strictly omitting guest_lookup_token, user_id, and excluding heavy proof_image in batch polling.
-- 6. Payment proof submission RPCs match frontend signature (p_code, p_token, p_image, p_note)
--    returning boolean true, validating order status and upload size.
-- 7. Admin management RPCs: admin_update_order_status, admin_approve_payment_proof,
--    admin_reject_payment_proof strictly protected by public.is_admin() and returning boolean true.
-- ============================================================================

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: Order Code Generation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_code text;
    v_exists boolean;
    v_attempts integer := 0;
BEGIN
    LOOP
        BEGIN
            v_code := 'GR-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 4));
        EXCEPTION WHEN OTHERS THEN
            v_code := 'GR-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
        END;

        SELECT EXISTS (SELECT 1 FROM public.orders WHERE code = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;

        v_attempts := v_attempts + 1;
        IF v_attempts > 20 THEN
            -- Unambiguous timestamp fallback to guarantee zero infinite loops
            RETURN 'GR-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4)) || (extract(epoch from clock_timestamp())::bigint % 100)::text;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_order_code() IS 'Generates unique collision-checked order code in format GR-XXXX';

-- ----------------------------------------------------------------------------
-- 2. Primary Authoritative Order Creation: create_order(p_order, p_items)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_order JSONB,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_guest_token TEXT;
    v_order_id UUID;
    v_code TEXT;
    v_customer_name TEXT;
    v_phone TEXT;
    v_service_type TEXT;
    v_zone TEXT;
    v_address TEXT;
    v_payment_method TEXT;
    v_scheduled_for TIMESTAMPTZ;
    v_status TEXT;
    v_proof_status TEXT;
    v_eta INTEGER;
    v_distance_km NUMERIC(6,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_subtotal NUMERIC(10,2) := 0.00;
    v_service_charge NUMERIC(10,2) := 0.00;
    v_total NUMERIC(10,2) := 0.00;

    v_deliv_settings JSONB;
    v_dest JSONB;
    v_dest_matched BOOLEAN := false;
    v_dest_enabled BOOLEAN := true;
    v_custom_menu JSONB;
    v_menu_elem JSONB;
    v_extras_config JSONB;
    v_extra_obj JSONB;

    v_item JSONB;
    v_item_id TEXT;
    v_qty INTEGER;
    v_item_name TEXT;
    v_base_price NUMERIC(10,2);
    v_in_stock BOOLEAN;
    v_base_choice TEXT;
    v_base_extra NUMERIC(10,2) := 0.00;
    v_spice INTEGER;
    v_extras TEXT[];
    v_extras_seen TEXT[];
    v_extra_elem TEXT;
    v_extra_normalized TEXT;
    v_extra_matched BOOLEAN;
    v_extra_price NUMERIC(10,2) := 0.00;
    v_matched_name TEXT;
    v_matched_price NUMERIC(10,2);
    v_matched_enabled BOOLEAN;
    v_note TEXT;
    v_item_total NUMERIC(10,2);
BEGIN
    -- 1. Identity binding: derive user_id authoritatively from session auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        -- High entropy 48-char random hex token for unauthenticated guest checkout
        v_guest_token := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48);
    ELSE
        v_guest_token := NULL;
    END IF;

    -- 2. Validate Order Header
    IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
        RAISE EXCEPTION 'Order payload must be a valid JSON object';
    END IF;

    v_customer_name := trim(coalesce(p_order->>'customer_name', ''));
    v_phone := trim(coalesce(p_order->>'phone', ''));
    v_service_type := lower(trim(coalesce(p_order->>'service_type', '')));
    v_payment_method := lower(trim(coalesce(p_order->>'payment_method', '')));
    v_zone := trim(coalesce(p_order->>'zone', ''));
    v_address := trim(coalesce(p_order->>'address', ''));

    IF char_length(v_customer_name) < 2 THEN
        RAISE EXCEPTION 'Customer name must be at least 2 characters';
    END IF;

    IF char_length(v_phone) < 7 THEN
        RAISE EXCEPTION 'A valid phone number is required';
    END IF;

    -- Normalize service type ('dine-in' / 'takeaway' / 'delivery')
    IF v_service_type IN ('dine-in', 'dine_in') THEN
        v_service_type := 'dine-in';
    ELSIF v_service_type IN ('takeaway', 'pickup') THEN
        v_service_type := 'takeaway';
    ELSIF v_service_type = 'delivery' THEN
        v_service_type := 'delivery';
    ELSE
        RAISE EXCEPTION 'Invalid service type: %. Allowed: dine-in, takeaway, delivery', v_service_type;
    END IF;

    -- Normalize payment method
    IF v_payment_method NOT IN ('cash', 'telebirr', 'cbe', 'cbe_birr', 'boa', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Must be cash, telebirr, or cbe', v_payment_method;
    END IF;

    -- Validate delivery constraints and compute verified delivery fee server-side
    IF v_service_type = 'delivery' THEN
        IF char_length(v_address) < 3 THEN
            RAISE EXCEPTION 'Delivery address is required for delivery orders';
        END IF;

        IF char_length(v_zone) = 0 THEN
            RAISE EXCEPTION 'Delivery destination/zone is required for delivery orders';
        END IF;

        -- Load authoritative delivery configuration from store_settings
        SELECT value INTO v_deliv_settings
        FROM public.store_settings
        WHERE key = 'delivery';

        IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'enabled') AND NOT (v_deliv_settings->>'enabled')::boolean THEN
            RAISE EXCEPTION 'Delivery service is currently disabled';
        END IF;

        IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'destinations') AND jsonb_typeof(v_deliv_settings->'destinations') = 'array' THEN
            FOR v_dest IN SELECT * FROM jsonb_array_elements(v_deliv_settings->'destinations')
            LOOP
                IF lower(trim(v_dest->>'id')) = lower(v_zone) OR lower(trim(v_dest->>'name')) = lower(v_zone) THEN
                    v_dest_matched := true;
                    v_dest_enabled := coalesce((v_dest->>'enabled')::boolean, true);
                    v_distance_km := coalesce((v_dest->>'distanceKm')::numeric, 0);
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF NOT v_dest_matched THEN
            -- Allow standard delivery zone fallback if zone name contains distance or campus
            IF lower(v_zone) LIKE '%techno%' THEN
                v_dest_matched := true;
                v_dest_enabled := true;
                v_distance_km := 4;
            ELSIF lower(v_zone) LIKE '%main%' THEN
                v_dest_matched := true;
                v_dest_enabled := true;
                v_distance_km := 2;
            ELSE
                RAISE EXCEPTION 'Unknown or invalid delivery zone: "%". Delivery is only available for supported destinations.', v_zone;
            END IF;
        END IF;

        IF NOT v_dest_enabled THEN
            RAISE EXCEPTION 'Delivery destination "%" is currently disabled', v_zone;
        END IF;

        IF v_distance_km < 0 THEN
            v_distance_km := 0;
        END IF;

        -- Server-authoritative delivery fee formula: ETB 30 + (distance_km * 10)
        v_delivery_fee := 30.00 + (v_distance_km * 10.00);
    ELSE
        v_delivery_fee := 0.00;
        v_distance_km := 0.00;
    END IF;

    -- Validate optional scheduled time
    IF p_order ? 'scheduled_for' AND p_order->>'scheduled_for' IS NOT NULL AND p_order->>'scheduled_for' <> '' THEN
        BEGIN
            v_scheduled_for := (p_order->>'scheduled_for')::timestamptz;
            IF v_scheduled_for < now() - interval '5 minutes' THEN
                RAISE EXCEPTION 'Scheduled order time cannot be in the past';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_scheduled_for := NULL;
        END;
    ELSE
        v_scheduled_for := NULL;
    END IF;

    -- Initial statuses
    v_status := CASE WHEN v_payment_method = 'cash' THEN 'placed' ELSE 'payment_pending' END;
    v_proof_status := 'none';
    v_eta := CASE v_service_type WHEN 'dine-in' THEN 20 WHEN 'takeaway' THEN 25 ELSE 40 END;

    -- 3. Load dynamic configurations from store_settings
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

    v_order_id := gen_random_uuid();
    v_code := public.generate_order_code();

    -- Create temporary table for validated order items
    CREATE TEMPORARY TABLE temp_order_items (
        menu_item_id TEXT,
        name TEXT,
        base_price NUMERIC(10,2),
        quantity INTEGER,
        base_choice TEXT,
        spice_level INTEGER,
        extras TEXT[],
        extra_price NUMERIC(10,2),
        item_total NUMERIC(10,2),
        note TEXT
    ) ON COMMIT DROP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Each item in order items must be a valid JSON object';
        END IF;

        v_item_id := trim(coalesce(v_item->>'menu_item_id', v_item->>'id', ''));
        v_qty := coalesce((v_item->>'quantity')::integer, 0);

        IF v_qty <= 0 OR v_qty > 100 THEN
            RAISE EXCEPTION 'Invalid quantity for item %: % (must be 1-100)', coalesce(v_item_id, 'unknown'), v_qty;
        END IF;

        -- Price resolution: 1) store_settings custom menu, 2) public.menu_items table
        v_base_price := NULL;
        v_item_name := NULL;
        v_in_stock := true;

        IF v_custom_menu IS NOT NULL AND jsonb_typeof(v_custom_menu) = 'array' THEN
            FOR v_menu_elem IN SELECT * FROM jsonb_array_elements(v_custom_menu)
            LOOP
                IF lower(trim(coalesce(v_menu_elem->>'id', ''))) = lower(v_item_id) THEN
                    v_item_name := trim(v_menu_elem->>'name');
                    v_base_price := (v_menu_elem->>'price')::numeric;
                    v_in_stock := coalesce((v_menu_elem->>'inStock')::boolean, (v_menu_elem->>'in_stock')::boolean, true);
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_base_price IS NULL THEN
            SELECT name, price, in_stock INTO v_item_name, v_base_price, v_in_stock
            FROM public.menu_items
            WHERE lower(id) = lower(v_item_id);
        END IF;

        IF v_base_price IS NULL OR v_item_name IS NULL THEN
            RAISE EXCEPTION 'Invalid or unknown menu item: %', v_item_id;
        END IF;

        IF NOT v_in_stock THEN
            RAISE EXCEPTION 'Item "%" is currently unavailable or out of stock', v_item_name;
        END IF;

        -- Validate serving choice (base)
        v_base_choice := coalesce(v_item->>'base_choice', v_item->>'base', 'Injera');
        IF lower(trim(v_base_choice)) IN ('kita bread', 'kita', 'bread') THEN
            v_base_extra := 25.00;
            v_base_choice := 'Kita bread';
        ELSIF lower(trim(v_base_choice)) IN ('injera', '') THEN
            v_base_extra := 0.00;
            v_base_choice := 'Injera';
        ELSIF lower(trim(v_base_choice)) IN ('no base', 'none') THEN
            v_base_extra := 0.00;
            v_base_choice := 'None';
        ELSE
            RAISE EXCEPTION 'Invalid serving choice "%" for item %. Allowed: Injera, Kita bread, Bread, None', v_base_choice, v_item_name;
        END IF;

        v_spice := coalesce((v_item->>'spice_level')::integer, (v_item->>'spice')::integer, 0);
        IF v_spice < 0 OR v_spice > 3 THEN
            v_spice := 0;
        END IF;

        v_note := coalesce(v_item->>'note', '');

        -- Validate extras
        v_extras := ARRAY[]::text[];
        v_extras_seen := ARRAY[]::text[];
        v_extra_price := 0.00;

        IF v_item ? 'extras' AND v_item->'extras' IS NOT NULL AND jsonb_typeof(v_item->'extras') = 'array' THEN
            FOR v_extra_elem IN SELECT jsonb_array_elements_text(v_item->'extras')
            LOOP
                v_matched_name := NULL;
                v_matched_price := NULL;
                v_matched_enabled := true;
                v_extra_matched := false;
                v_extra_normalized := lower(trim(coalesce(v_extra_elem, '')));

                IF v_extra_normalized = '' THEN
                    CONTINUE;
                END IF;

                -- Prevent duplicate extras on a single item (case-insensitive)
                IF v_extra_normalized = ANY(v_extras_seen) THEN
                    RAISE EXCEPTION 'Duplicate extra option "%" for item %', v_extra_elem, v_item_name;
                END IF;
                v_extras_seen := array_append(v_extras_seen, v_extra_normalized);

                -- 1. Check store_settings extras catalog
                IF v_extras_config IS NOT NULL AND jsonb_typeof(v_extras_config) = 'array' THEN
                    FOR v_extra_obj IN SELECT * FROM jsonb_array_elements(v_extras_config)
                    LOOP
                        IF lower(trim(coalesce(v_extra_obj->>'name', ''))) = v_extra_normalized
                           OR lower(trim(coalesce(v_extra_obj->>'id', ''))) = replace(v_extra_normalized, ' ', '-') THEN
                            v_extra_matched := true;
                            v_matched_name := trim(v_extra_obj->>'name');
                            v_matched_price := (v_extra_obj->>'price')::numeric;
                            v_matched_enabled := coalesce((v_extra_obj->>'enabled')::boolean, true);
                            EXIT;
                        END IF;
                    END LOOP;
                END IF;

                IF v_extra_matched THEN
                    IF NOT v_matched_enabled THEN
                        RAISE EXCEPTION 'Extra option "%" is currently disabled and cannot be selected', v_extra_elem;
                    END IF;
                    v_extra_price := v_extra_price + v_matched_price;
                    v_extras := array_append(v_extras, v_matched_name);
                -- Standard fallback extras (configured via store_settings or trusted food extras)
                ELSIF v_extra_normalized IN ('extra injera', 'extra-injera') THEN
                    v_extra_price := v_extra_price + 30.00;
                    v_extras := array_append(v_extras, 'Extra injera');
                ELSIF v_extra_normalized IN ('ayib cheese', 'ayib (cottage cheese)', 'ayib') THEN
                    v_extra_price := v_extra_price + 45.00;
                    v_extras := array_append(v_extras, 'Ayib cheese');
                ELSIF v_extra_normalized IN ('boiled egg', 'boiled-egg') THEN
                    v_extra_price := v_extra_price + 35.00;
                    v_extras := array_append(v_extras, 'Boiled egg');
                ELSIF v_extra_normalized IN ('extra awaze', 'extra-awaze') THEN
                    v_extra_price := v_extra_price + 20.00;
                    v_extras := array_append(v_extras, 'Extra awaze');
                ELSE
                    RAISE EXCEPTION 'Invalid extra option "%" for item %', v_extra_elem, v_item_name;
                END IF;
            END LOOP;
        END IF;

        -- Authoritative calculation of item total
        v_item_total := (v_base_price + v_base_extra + v_extra_price) * v_qty;
        v_subtotal := v_subtotal + v_item_total;

        INSERT INTO temp_order_items (
            menu_item_id,
            name,
            base_price,
            quantity,
            base_choice,
            spice_level,
            extras,
            extra_price,
            item_total,
            note
        ) VALUES (
            v_item_id,
            v_item_name,
            v_base_price,
            v_qty,
            v_base_choice,
            v_spice,
            v_extras,
            (v_base_extra + v_extra_price),
            v_item_total,
            v_note
        );
    END LOOP;

    -- 5. Calculate summary financial totals server-side
    IF v_service_type = 'dine-in' THEN
        v_service_charge := round(v_subtotal * 0.05);
    ELSE
        v_service_charge := 0.00;
    END IF;

    v_total := v_subtotal + v_delivery_fee + v_service_charge;

    -- 6. Insert Order Header
    INSERT INTO public.orders (
        id,
        code,
        user_id,
        guest_lookup_token,
        customer_name,
        phone,
        service_type,
        zone,
        distance_km,
        address,
        subtotal,
        delivery_fee,
        delivery_charge,
        service_fee,
        service_charge,
        total,
        payment_method,
        proof_status,
        proof_image,
        proof_note,
        status,
        eta,
        staff_note,
        scheduled_for,
        created_at
    ) VALUES (
        v_order_id,
        v_code,
        v_user_id,
        v_guest_token,
        v_customer_name,
        v_phone,
        v_service_type,
        v_zone,
        v_distance_km,
        v_address,
        v_subtotal,
        v_delivery_fee,
        v_delivery_fee,
        v_service_charge,
        v_service_charge,
        v_total,
        v_payment_method,
        'none',
        '',
        '',
        v_status,
        v_eta,
        '',
        v_scheduled_for,
        timezone('utc'::text, now())
    );

    -- 7. Insert Order Items
    INSERT INTO public.order_items (
        id,
        order_id,
        menu_item_id,
        name,
        base_price,
        quantity,
        base_choice,
        spice_level,
        extras,
        extra_price,
        item_total,
        note,
        created_at
    )
    SELECT
        gen_random_uuid(),
        v_order_id,
        menu_item_id,
        name,
        base_price,
        quantity,
        base_choice,
        spice_level,
        extras,
        extra_price,
        item_total,
        note,
        timezone('utc'::text, now())
    FROM temp_order_items;

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
        'created_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.create_order(JSONB, JSONB) IS 'Authoritative order creation calculating all prices, surcharges, and totals server-side.';

REVOKE ALL ON FUNCTION public.create_order(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, JSONB) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Guest Order Retrieval RPCs (Minimal Data Exposure)
-- ----------------------------------------------------------------------------

-- Single guest order lookup: requires code and secret tracking token
CREATE OR REPLACE FUNCTION public.get_guest_order(
    p_code TEXT,
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_order JSONB;
    v_items JSONB;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' OR length(trim(p_token)) < 16 OR p_code IS NULL OR trim(p_code) = '' THEN
        RETURN NULL;
    END IF;

    -- Strictly customer-facing fields; NEVER expose guest_lookup_token or user_id
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

    SELECT coalesce(jsonb_agg(jsonb_build_object(
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

    RETURN jsonb_build_object(
        'order', v_order,
        'items', v_items
    );
END;
$$;

COMMENT ON FUNCTION public.get_guest_order(TEXT, TEXT) IS 'Retrieves guest order with valid code and secret tracking token without leaking internal user_id or secret token.';

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
SET search_path = public, pg_temp
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

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_orders)
    LOOP
        v_code := trim(coalesce(v_item->>'code', ''));
        v_token := trim(coalesce(v_item->>'token', ''));

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
                'proof_image', '', -- Excluded in batch polling to optimize payload
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
                SELECT coalesce(jsonb_agg(jsonb_build_object(
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

COMMENT ON FUNCTION public.get_guest_orders(JSONB) IS 'Batch lookup for guest orders by code+token. Excludes heavy proof_image to protect client bandwidth.';

REVOKE ALL ON FUNCTION public.get_guest_orders(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_orders(JSONB) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Payment Proof Submission RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_code TEXT,
    p_token TEXT,
    p_image TEXT,
    p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_current_user UUID;
    v_current_status TEXT;
    v_current_proof_status TEXT;
    v_clean_image TEXT;
BEGIN
    v_current_user := auth.uid();
    v_clean_image := trim(p_image);

    -- Image validation
    IF v_clean_image IS NULL OR v_clean_image = '' THEN
        RAISE EXCEPTION 'Payment proof image is required';
    END IF;

    IF octet_length(v_clean_image) > 7500000 THEN
        RAISE EXCEPTION 'Payment proof image exceeds maximum allowed size of 5MB';
    END IF;

    IF v_clean_image NOT LIKE 'data:image/%'
       AND v_clean_image NOT LIKE 'http://%'
       AND v_clean_image NOT LIKE 'https://%'
       AND v_clean_image NOT LIKE 'payment-proofs/%' THEN
        RAISE EXCEPTION 'Invalid payment proof image format. Must be an image storage path or data URL';
    END IF;

    -- Verify authorization: authenticated owner, valid guest token, or verified admin
    SELECT id, status, proof_status INTO v_order_id, v_current_status, v_current_proof_status
    FROM public.orders
    WHERE code = trim(p_code)
      AND (
          (v_current_user IS NOT NULL AND user_id = v_current_user)
          OR (p_token IS NOT NULL AND length(trim(p_token)) >= 16 AND guest_lookup_token = trim(p_token))
          OR (public.is_admin())
      );

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order not found or unauthorized to submit payment proof for order %', p_code;
    END IF;

    IF v_current_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot submit payment proof for % order %', v_current_status, p_code;
    END IF;

    IF v_current_proof_status IN ('approved', 'verified') THEN
        RAISE EXCEPTION 'Payment proof has already been verified for order %', p_code;
    END IF;

    UPDATE public.orders
    SET proof_image = v_clean_image,
        proof_note = coalesce(trim(p_note), proof_note),
        proof_status = 'pending'
    WHERE id = v_order_id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) IS 'Submits payment proof image reference and advances proof status to pending.';

REVOKE ALL ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Backward compatibility wrapper for submit_guest_payment_proof
CREATE OR REPLACE FUNCTION public.submit_guest_payment_proof(
    p_code TEXT,
    p_token TEXT,
    p_image TEXT,
    p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN public.submit_payment_proof(p_code, p_token, p_image, p_note);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_guest_payment_proof(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guest_payment_proof(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Administrator Order & Payment Management RPCs
-- ----------------------------------------------------------------------------

-- Admin Order Status Transition
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
    p_code TEXT,
    p_status TEXT,
    p_staff_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_status TEXT;
    v_current_status TEXT;
    v_service_type TEXT;
    v_payment_method TEXT;
    v_proof_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrator privileges required';
    END IF;

    v_clean_status := lower(trim(p_status));
    IF v_clean_status IN ('out for delivery', 'out_for_delivery', 'on the way') THEN
        v_clean_status := 'dispatched';
    ELSIF v_clean_status IN ('ready for pickup', 'ready_for_pickup') THEN
        v_clean_status := 'ready';
    END IF;

    IF v_clean_status NOT IN ('placed', 'payment_pending', 'accepted', 'preparing', 'ready', 'dispatched', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid order status: %', p_status;
    END IF;

    SELECT status, service_type, payment_method, proof_status
    INTO v_current_status, v_service_type, v_payment_method, v_proof_status
    FROM public.orders
    WHERE code = trim(p_code);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_code;
    END IF;

    -- Enforce terminal state invariants
    IF v_current_status = 'cancelled' AND v_clean_status <> 'cancelled' THEN
        RAISE EXCEPTION 'Cannot modify status of cancelled order %', p_code;
    END IF;

    IF v_current_status = 'completed' AND v_clean_status <> 'completed' THEN
        RAISE EXCEPTION 'Cannot modify status of completed order %', p_code;
    END IF;

    -- Non-delivery orders cannot be marked as dispatched
    IF v_clean_status = 'dispatched' AND v_service_type <> 'delivery' THEN
        RAISE EXCEPTION 'Out for delivery stage is only applicable to delivery orders. Order % is %.', p_code, v_service_type;
    END IF;

    -- Electronic payment orders cannot move to kitchen stages without verified payment
    IF v_clean_status IN ('accepted', 'preparing', 'ready', 'dispatched', 'completed')
       AND v_payment_method <> 'cash'
       AND v_proof_status NOT IN ('approved', 'verified') THEN
        RAISE EXCEPTION 'Cannot advance order % to "%": Payment proof must be approved first for % payment', p_code, v_clean_status, v_payment_method;
    END IF;

    UPDATE public.orders
    SET status = v_clean_status,
        staff_note = coalesce(p_staff_note, staff_note)
    WHERE code = trim(p_code);

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_update_order_status(TEXT, TEXT, TEXT) IS 'Allows administrators to transition order status while enforcing business rules and payment invariants.';

REVOKE ALL ON FUNCTION public.admin_update_order_status(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_order_status(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Admin Approve Payment Proof
CREATE OR REPLACE FUNCTION public.admin_approve_payment_proof(
    p_code TEXT,
    p_staff_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_proof_image TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrator privileges required';
    END IF;

    SELECT proof_image INTO v_proof_image
    FROM public.orders
    WHERE code = trim(p_code);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_code;
    END IF;

    IF v_proof_image IS NULL OR trim(v_proof_image) = '' THEN
        RAISE EXCEPTION 'Cannot approve order %: no payment proof image has been submitted', p_code;
    END IF;

    UPDATE public.orders
    SET proof_status = 'approved',
        staff_note = coalesce(p_staff_note, staff_note)
    WHERE code = trim(p_code);

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_approve_payment_proof(TEXT, TEXT) IS 'Approves payment proof for an order without forcing an arbitrary status transition.';

REVOKE ALL ON FUNCTION public.admin_approve_payment_proof(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_proof(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_proof(TEXT, TEXT) TO authenticated, service_role;

-- Admin Reject Payment Proof
CREATE OR REPLACE FUNCTION public.admin_reject_payment_proof(
    p_code TEXT,
    p_staff_note TEXT DEFAULT 'Payment verification failed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrator privileges required';
    END IF;

    UPDATE public.orders
    SET proof_status = 'rejected',
        staff_note = coalesce(p_staff_note, staff_note)
    WHERE code = trim(p_code);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_code;
    END IF;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_reject_payment_proof(TEXT, TEXT) IS 'Rejects payment proof with an explanatory staff note.';

REVOKE ALL ON FUNCTION public.admin_reject_payment_proof(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_payment_proof(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_proof(TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Account Linking RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_guest_order(
    p_code TEXT,
    p_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to link orders';
    END IF;

    UPDATE public.orders
    SET user_id = v_user_id
    WHERE code = trim(p_code)
      AND guest_lookup_token = trim(p_token)
      AND user_id IS NULL;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guest_order(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_guest_order(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_guest_order(TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_verified_phone_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_phone TEXT;
    v_count INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT phone INTO v_phone
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_phone IS NULL OR trim(v_phone) = '' THEN
        RETURN 0;
    END IF;

    WITH updated AS (
        UPDATE public.orders
        SET user_id = v_user_id
        WHERE phone = trim(v_phone)
          AND user_id IS NULL
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM updated;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_verified_phone_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_verified_phone_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_verified_phone_orders() TO authenticated, service_role;
