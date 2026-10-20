-- ============================================================================
-- GURESHA CAFE MIGRATION 2 of 3: Order RPCs & Guest Checkout
-- File: supabase/migrations/20261020_02_order_rpcs_and_guest_checkout.sql
-- Status: PROPOSED — NOT YET EXECUTED
-- Target Environments: Staging (qwmgiamqheqadpyfrqvr) -> Production (hiisvmovrlxgfsgtercn)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Helper function: generate secure unique order code
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        v_code := 'GUR-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 6));
        SELECT EXISTS (SELECT 1 FROM public.orders WHERE code = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;
    END LOOP;
END;
$$;

-- 2. Main Order Creation RPC: create_order
CREATE OR REPLACE FUNCTION public.create_order(
    p_customer_name TEXT,
    p_phone TEXT,
    p_order_type TEXT,
    p_payment_method TEXT,
    p_items JSONB,
    p_serving_choice TEXT DEFAULT NULL,
    p_delivery_address TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_table_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_order_id BIGINT;
    v_order_code TEXT;
    v_guest_token TEXT := NULL;
    v_user_id UUID;
    v_item RECORD;
    v_menu_item RECORD;
    v_extra JSONB;
    v_extra_name TEXT;
    v_extra_price NUMERIC(10,2);
    v_extras_total NUMERIC(10,2);
    v_clean_extras JSONB;
    v_base_choice TEXT;
    v_base_extra NUMERIC(10,2);
    v_unit_price NUMERIC(10,2);
    v_item_total NUMERIC(10,2);
    v_subtotal NUMERIC(10,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_service_charge NUMERIC(10,2) := 0.00;
    v_total NUMERIC(10,2) := 0.00;
    v_clean_type TEXT;
    v_clean_payment TEXT;
    v_extras_catalog JSONB;
BEGIN
    -- Validate caller inputs
    IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required';
    END IF;

    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RAISE EXCEPTION 'Phone number is required';
    END IF;

    v_clean_type := lower(trim(p_order_type));
    IF v_clean_type NOT IN ('dine_in', 'takeaway', 'delivery') THEN
        RAISE EXCEPTION 'Invalid order type: %. Must be dine_in, takeaway, or delivery', p_order_type;
    END IF;

    IF v_clean_type = 'delivery' AND (p_delivery_address IS NULL OR trim(p_delivery_address) = '') THEN
        RAISE EXCEPTION 'Delivery address is required for delivery orders';
    END IF;

    v_clean_payment := lower(trim(p_payment_method));
    IF v_clean_payment NOT IN ('cash', 'cbe_birr', 'telebirr', 'boa') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Must be cash, cbe_birr, telebirr, or boa', p_payment_method;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item';
    END IF;

    -- Fetch dynamic extras catalog from store_settings
    SELECT value INTO v_extras_catalog
    FROM public.store_settings
    WHERE key = 'extras';

    -- Determine authenticated user vs guest checkout
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        -- High entropy 64-character hex token for secure guest order claiming and retrieval
        v_guest_token := encode(gen_random_bytes(32), 'hex');
    END IF;

    v_order_code := public.generate_order_code();

    -- Create temporary table to hold validated items
    CREATE TEMPORARY TABLE temp_validated_items (
        menu_item_id BIGINT,
        name TEXT,
        quantity INTEGER,
        unit_price NUMERIC(10,2),
        serving_choice TEXT,
        extras JSONB,
        item_total NUMERIC(10,2)
    ) ON COMMIT DROP;

    -- Iterate and securely validate items and server-side pricing
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        menu_item_id BIGINT,
        id BIGINT,
        quantity INTEGER,
        serving_choice TEXT,
        extras JSONB
    )
    LOOP
        -- Support both 'menu_item_id' and 'id' from frontend payloads
        IF v_item.menu_item_id IS NULL AND v_item.id IS NOT NULL THEN
            v_item.menu_item_id := v_item.id;
        END IF;

        IF v_item.menu_item_id IS NULL THEN
            RAISE EXCEPTION 'Item missing valid menu_item_id';
        END IF;

        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero';
        END IF;

        -- Fetch official item from database (never trust client price)
        SELECT id, name, price, is_available INTO v_menu_item
        FROM public.menu_items
        WHERE id = v_item.menu_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Menu item ID % not found', v_item.menu_item_id;
        END IF;

        IF NOT coalesce(v_menu_item.is_available, true) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable', v_menu_item.name;
        END IF;

        v_unit_price := v_menu_item.price;

        -- Normalize Serving Choice: CustomerViews.tsx transmits 'Bread' when Kita bread is selected
        v_base_choice := coalesce(v_item.serving_choice, p_serving_choice, 'None');
        IF lower(trim(v_base_choice)) IN ('kita bread', 'kita', 'bread') THEN
            v_base_extra := 25.00;
            v_base_choice := 'Kita bread';
        ELSIF lower(trim(v_base_choice)) = 'injera' THEN
            v_base_extra := 0.00;
            v_base_choice := 'Injera';
        ELSIF lower(trim(v_base_choice)) IN ('none', '') OR v_base_choice IS NULL THEN
            v_base_extra := 0.00;
            v_base_choice := 'None';
        ELSE
            RAISE EXCEPTION 'Invalid serving choice: %. Allowed: Injera, Kita bread, Bread, None', v_base_choice;
        END IF;

        -- Validate and price extras (both food extras and drink add-ons)
        v_extras_total := 0.00;
        v_clean_extras := '[]'::jsonb;

        IF v_item.extras IS NOT NULL AND jsonb_typeof(v_item.extras) = 'array' THEN
            FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item.extras)
            LOOP
                IF jsonb_typeof(v_extra) = 'string' THEN
                    v_extra_name := trim(both '"' from v_extra::text);
                ELSIF jsonb_typeof(v_extra) = 'object' THEN
                    v_extra_name := coalesce(v_extra->>'name', v_extra->>'id', '');
                ELSE
                    CONTINUE;
                END IF;

                -- Match extra in store_settings catalog or hardcoded trusted fallback
                v_extra_price := NULL;
                IF v_extras_catalog IS NOT NULL THEN
                    SELECT (e->>'price')::numeric INTO v_extra_price
                    FROM jsonb_array_elements(v_extras_catalog) e
                    WHERE lower(e->>'name') = lower(v_extra_name)
                       OR lower(e->>'id') = lower(replace(v_extra_name, ' ', '-'));
                END IF;

                -- Fallback lookup for standard catalog
                IF v_extra_price IS NULL THEN
                    CASE lower(v_extra_name)
                        WHEN 'extra injera' THEN v_extra_price := 20.00;
                        WHEN 'extra kita' THEN v_extra_price := 25.00;
                        WHEN 'boiled egg' THEN v_extra_price := 20.00;
                        WHEN 'ayib (cottage cheese)' THEN v_extra_price := 30.00;
                        WHEN 'ayib' THEN v_extra_price := 30.00;
                        WHEN 'ethiopian coffee' THEN v_extra_price := 25.00;
                        WHEN 'soft drink' THEN v_extra_price := 35.00;
                        WHEN 'ambo water' THEN v_extra_price := 30.00;
                        ELSE
                            RAISE EXCEPTION 'Unknown or unconfigured extra: "%"', v_extra_name;
                    END CASE;
                END IF;

                v_extras_total := v_extras_total + v_extra_price;
                v_clean_extras := v_clean_extras || jsonb_build_object('name', v_extra_name, 'price', v_extra_price);
            END LOOP;
        END IF;

        -- Calculate item total: (unit_price + base_extra + extras_total) * quantity
        v_item_total := (v_unit_price + v_base_extra + v_extras_total) * v_item.quantity;
        v_subtotal := v_subtotal + v_item_total;

        INSERT INTO temp_validated_items (
            menu_item_id,
            name,
            quantity,
            unit_price,
            serving_choice,
            extras,
            item_total
        ) VALUES (
            v_menu_item.id,
            v_menu_item.name,
            v_item.quantity,
            v_unit_price,
            v_base_choice,
            v_clean_extras,
            v_item_total
        );
    END LOOP;

    -- Compute delivery fee and service charge server-side
    IF v_clean_type = 'delivery' THEN
        v_delivery_fee := 50.00;
    ELSE
        v_delivery_fee := 0.00;
    END IF;

    IF v_clean_type = 'dine_in' THEN
        v_service_charge := round(v_subtotal * 0.05, 2);
    ELSE
        v_service_charge := 0.00;
    END IF;

    v_total := v_subtotal + v_delivery_fee + v_service_charge;

    -- Insert into public.orders
    INSERT INTO public.orders (
        code,
        customer_name,
        phone,
        order_type,
        payment_method,
        serving_choice,
        delivery_address,
        notes,
        table_number,
        subtotal,
        delivery_fee,
        delivery_charge,
        service_fee,
        service_charge,
        total,
        status,
        proof_status,
        user_id,
        guest_lookup_token
    ) VALUES (
        v_order_code,
        trim(p_customer_name),
        trim(p_phone),
        v_clean_type,
        v_clean_payment,
        coalesce(p_serving_choice, 'None'),
        p_delivery_address,
        p_notes,
        p_table_number,
        v_subtotal,
        v_delivery_fee,
        v_delivery_fee,
        v_service_charge,
        v_service_charge,
        v_total,
        'pending',
        'pending',
        v_user_id,
        v_guest_token
    ) RETURNING id INTO v_order_id;

    -- Insert into public.order_items
    INSERT INTO public.order_items (
        order_id,
        menu_item_id,
        name,
        quantity,
        unit_price,
        serving_choice,
        extras,
        item_total
    )
    SELECT
        v_order_id,
        menu_item_id,
        name,
        quantity,
        unit_price,
        serving_choice,
        extras,
        item_total
    FROM temp_validated_items;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'code', v_order_code,
        'total', v_total,
        'subtotal', v_subtotal,
        'delivery_fee', v_delivery_fee,
        'service_fee', v_service_charge,
        'status', 'pending',
        'payment_method', v_clean_payment,
        'guest_lookup_token', v_guest_token
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 3. Guest Order Retrieval RPCs
CREATE OR REPLACE FUNCTION public.get_guest_order(
    p_code TEXT,
    p_guest_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE code = trim(p_code)
      AND guest_lookup_token = trim(p_guest_token);

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'menu_item_id', menu_item_id,
            'name', name,
            'quantity', quantity,
            'unit_price', unit_price,
            'serving_choice', serving_choice,
            'extras', extras,
            'item_total', item_total
        )
    ) INTO v_items
    FROM public.order_items
    WHERE order_id = v_order.id;

    RETURN jsonb_build_object(
        'id', v_order.id,
        'code', v_order.code,
        'customer_name', v_order.customer_name,
        'phone', v_order.phone,
        'order_type', v_order.order_type,
        'status', v_order.status,
        'payment_method', v_order.payment_method,
        'subtotal', v_order.subtotal,
        'delivery_fee', v_order.delivery_fee,
        'delivery_charge', v_order.delivery_charge,
        'service_fee', v_order.service_fee,
        'service_charge', v_order.service_charge,
        'total', v_order.total,
        'serving_choice', v_order.serving_choice,
        'delivery_address', v_order.delivery_address,
        'table_number', v_order.table_number,
        'notes', v_order.notes,
        'proof_status', v_order.proof_status,
        'proof_image', v_order.proof_image,
        'proof_rejection_reason', v_order.proof_rejection_reason,
        'created_at', v_order.created_at,
        'items', coalesce(v_items, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_order(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_order(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_guest_orders(
    p_orders JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_pair RECORD;
    v_results JSONB := '[]'::jsonb;
    v_order_json JSONB;
BEGIN
    IF p_orders IS NULL OR jsonb_array_length(p_orders) = 0 THEN
        RETURN '[]'::jsonb;
    END IF;

    FOR v_pair IN SELECT * FROM jsonb_to_recordset(p_orders) AS x(code TEXT, token TEXT)
    LOOP
        v_order_json := public.get_guest_order(v_pair.code, v_pair.token);
        IF v_order_json IS NOT NULL THEN
            v_results := v_results || v_order_json;
        END IF;
    END LOOP;

    RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_orders(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_orders(JSONB) TO anon, authenticated, service_role;

-- 4. Payment Proof Submission RPCs
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id BIGINT,
    p_proof_image TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit payment proof through this endpoint';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Caller must own the order or be an admin
    IF v_order.user_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: You do not have permission to update this order';
    END IF;

    UPDATE public.orders
    SET proof_image = trim(p_proof_image),
        proof_status = 'pending',
        proof_uploaded_at = timezone('utc'::text, now()),
        proof_rejection_reason = NULL
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'proof_status', 'pending',
        'message', 'Payment proof submitted successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_payment_proof(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(BIGINT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_guest_payment_proof(
    p_code TEXT,
    p_guest_token TEXT,
    p_proof_image TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE code = trim(p_code)
      AND guest_lookup_token = trim(p_guest_token);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or invalid guest credentials';
    END IF;

    UPDATE public.orders
    SET proof_image = trim(p_proof_image),
        proof_status = 'pending',
        proof_uploaded_at = timezone('utc'::text, now()),
        proof_rejection_reason = NULL
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'code', v_order.code,
        'proof_status', 'pending',
        'message', 'Payment proof submitted successfully'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_guest_payment_proof(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guest_payment_proof(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 5. Admin Management RPCs (Protected by public.is_admin())
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
    p_order_id BIGINT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrator privileges required';
    END IF;

    v_clean_status := lower(trim(p_status));
    IF v_clean_status NOT IN ('pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid order status: %', p_status;
    END IF;

    UPDATE public.orders
    SET status = v_clean_status
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order ID % not found', p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', v_clean_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_order_status(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(BIGINT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_approve_payment_proof(
    p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access Denied: Administrator privileges required';
    END IF;

    UPDATE public.orders
    SET proof_status = 'approved',
        proof_reviewed_at = timezone('utc'::text, now()),
        proof_reviewed_by = auth.uid(),
        proof_rejection_reason = NULL,
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order ID % not found', p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'proof_status', 'approved'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_payment_proof(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_payment_proof(BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_proof(BIGINT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reject_payment_proof(
    p_order_id BIGINT,
    p_reason TEXT DEFAULT 'Payment proof could not be verified'
)
RETURNS JSONB
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
        proof_rejection_reason = trim(p_reason),
        proof_reviewed_at = timezone('utc'::text, now()),
        proof_reviewed_by = auth.uid()
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order ID % not found', p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'proof_status', 'rejected',
        'reason', p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_payment_proof(BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_payment_proof(BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_proof(BIGINT, TEXT) TO authenticated, service_role;
