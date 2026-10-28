-- ============================================================================
-- KORA Roasters — Additive Supabase Migration:
-- RLS Policies, Customer Order Request RPC, and Atomic Admin Inventory RPCs
-- ============================================================================
-- SAFETY NOTES:
-- 1. Idempotent & additive only: does NOT drop tables or erase existing data.
-- 2. Enforces Row-Level Security (RLS) using existing `public.is_kora_admin()`.
-- 3. Calculates prices/totals strictly from `public.products` on the server.
-- 4. Locks rows (`FOR UPDATE`) during confirmation and cancellation to prevent
--    race conditions, partial deductions, or duplicate stock updates.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. DEFENSIVE ADDITIVE SCHEMA ENSURE (Preserves existing tables & data)
-- ----------------------------------------------------------------------------

-- Ensure expected columns exist on public.products
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_etb numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_weight_g integer DEFAULT 250,
  ADD COLUMN IF NOT EXISTS roast_profile text,
  ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_path text DEFAULT '/images/kora-bag-default.svg',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure expected columns exist on public.orders
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS contact_method text,
  ADD COLUMN IF NOT EXISTS contact_value text,
  ADD COLUMN IF NOT EXISTS note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS total_etb numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_restored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- If the existing orders table used a `reference` column before `reference_code` was added,
-- keep them synchronized for existing rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'reference'
  ) THEN
    EXECUTE 'UPDATE public.orders SET reference_code = reference WHERE reference_code IS NULL AND reference IS NOT NULL';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kora_orders_reference_code_unique
  ON public.orders (upper(reference_code))
  WHERE reference_code IS NOT NULL;

-- Ensure expected snapshot columns exist on public.order_items
ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS roast_profile text,
  ADD COLUMN IF NOT EXISTS net_weight_g integer DEFAULT 250,
  ADD COLUMN IF NOT EXISTS unit_price_etb numeric(12,2),
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS line_total_etb numeric(12,2),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------------------------
-- 2. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kora_admins ENABLE ROW LEVEL SECURITY;

-- Products: Anonymous & authenticated visitors can read active products;
-- Authorized admins can read all products (including inactive) and modify them.
DROP POLICY IF EXISTS "kora_products_select_active_or_admin" ON public.products;
CREATE POLICY "kora_products_select_active_or_admin"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_kora_admin());

DROP POLICY IF EXISTS "kora_products_admin_insert" ON public.products;
CREATE POLICY "kora_products_admin_insert"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_kora_admin());

DROP POLICY IF EXISTS "kora_products_admin_update" ON public.products;
CREATE POLICY "kora_products_admin_update"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.is_kora_admin())
  WITH CHECK (public.is_kora_admin());

DROP POLICY IF EXISTS "kora_products_admin_delete" ON public.products;
CREATE POLICY "kora_products_admin_delete"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.is_kora_admin());

-- Orders: Strictly admin-only for direct table SELECT / INSERT / UPDATE / DELETE.
-- Anonymous visitors cannot read or modify orders directly (they submit via RPC).
DROP POLICY IF EXISTS "kora_orders_admin_all" ON public.orders;
CREATE POLICY "kora_orders_admin_all"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_kora_admin())
  WITH CHECK (public.is_kora_admin());

-- Order Items: Strictly admin-only for direct table access.
DROP POLICY IF EXISTS "kora_order_items_admin_all" ON public.order_items;
CREATE POLICY "kora_order_items_admin_all"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (public.is_kora_admin())
  WITH CHECK (public.is_kora_admin());

-- Admins table: Only admins can read the admin membership table.
DROP POLICY IF EXISTS "kora_admins_select_self_or_admin" ON public.kora_admins;
CREATE POLICY "kora_admins_select_self_or_admin"
  ON public.kora_admins
  FOR SELECT
  TO authenticated
  USING (public.is_kora_admin());

-- ----------------------------------------------------------------------------
-- 3. HELPER: NON-SEQUENTIAL ORDER REFERENCE GENERATOR (e.g., KR-A7F29C)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_kora_order_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_token text;
  v_ref text;
  v_exists boolean;
  i integer;
BEGIN
  LOOP
    v_token := '';
    FOR i IN 1..6 LOOP
      v_token := v_token || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    v_ref := 'KR-' || v_token;

    SELECT EXISTS (
      SELECT 1
      FROM public.orders
      WHERE upper(coalesce(reference_code, '')) = v_ref
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_kora_order_reference() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER ORDER REQUEST RPC: `public.create_order_request`
-- ----------------------------------------------------------------------------
-- Validates inputs & live product stock, calculates prices/totals strictly
-- from `public.products`, creates a `pending` order and `order_items` snapshots
-- WITHOUT deducting stock, and returns a redacted summary (no contact_value).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_request(
  p_customer_name text,
  p_contact_method text,
  p_contact_value text,
  p_note text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_method text := lower(btrim(coalesce(p_contact_method, '')));
  v_contact text := btrim(coalesce(p_contact_value, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_digits text;
  v_ref text;
  v_order_id uuid;
  v_total_etb numeric(12,2) := 0;
  v_now timestamptz := now();
  v_item record;
  v_product record;
  v_line_total numeric(12,2);
  v_items_summary jsonb := '[]'::jsonb;
  v_has_reference_col boolean;
BEGIN
  -- 1. Validate customer name
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter a valid customer name (2–120 characters).';
  END IF;

  -- 2. Validate single contact method and value
  IF v_method NOT IN ('email', 'phone') THEN
    RAISE EXCEPTION 'Contact method must be either email or phone.';
  END IF;

  IF v_contact = '' OR char_length(v_contact) > 160 THEN
    RAISE EXCEPTION 'Please provide a valid contact detail for the selected method.';
  END IF;

  IF v_method = 'email' THEN
    IF v_contact !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RAISE EXCEPTION 'Please enter a valid email address.';
    END IF;
  ELSE
    v_digits := regexp_replace(v_contact, '[\s\-()+]', '', 'g');
    IF v_digits !~ '^\d{7,15}$' THEN
      RAISE EXCEPTION 'Please enter a valid phone number (7–15 digits).';
    END IF;
  END IF;

  IF char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Order note cannot exceed 1000 characters.';
  END IF;

  -- 3. Validate p_items JSON array
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your request cart is empty. Please add at least one coffee release.';
  END IF;

  -- 4. Aggregate requested quantities per product_id & verify stock/prices in public.products
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      sum((elem->>'quantity')::integer)::integer AS requested_qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'product_id') IS NOT NULL
      AND (elem->>'quantity') ~ '^\d+$'
    GROUP BY (elem->>'product_id')::uuid
  LOOP
    IF v_item.requested_qty IS NULL OR v_item.requested_qty <= 0 THEN
      RAISE EXCEPTION 'Requested product quantity must be a positive integer.';
    END IF;

    SELECT
      id,
      name,
      price_etb,
      net_weight_g,
      roast_profile,
      stock_quantity,
      is_active
    INTO v_product
    FROM public.products
    WHERE id = v_item.product_id;

    IF NOT FOUND OR v_product.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'One or more requested products are no longer active.';
    END IF;

    IF coalesce(v_product.stock_quantity, 0) <= 0 THEN
      RAISE EXCEPTION '% is currently Out of Stock.', v_product.name;
    END IF;

    IF v_item.requested_qty > v_product.stock_quantity THEN
      RAISE EXCEPTION 'Requested quantity (%) for % exceeds available stock (%).',
        v_item.requested_qty, v_product.name, v_product.stock_quantity;
    END IF;

    v_line_total := round((v_product.price_etb * v_item.requested_qty)::numeric, 2);
    v_total_etb := v_total_etb + v_line_total;
  END LOOP;

  IF v_total_etb <= 0 THEN
    RAISE EXCEPTION 'Invalid order request items.';
  END IF;

  -- 5. Generate unique non-sequential reference (e.g., KR-A7F29C)
  v_ref := public.generate_kora_order_reference();

  -- 6. Insert Pending order (Stock is NOT deducted while pending)
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'reference'
  ) INTO v_has_reference_col;

  IF v_has_reference_col THEN
    EXECUTE $sql$
      INSERT INTO public.orders (
        reference,
        reference_code,
        customer_name,
        contact_method,
        contact_value,
        note,
        status,
        total_etb,
        stock_deducted,
        stock_restored,
        history,
        created_at,
        updated_at
      ) VALUES ($1, $1, $2, $3, $4, $5, 'pending', $6, false, false, $7, $8, $8)
      RETURNING id
    $sql$
    INTO v_order_id
    USING
      v_ref,
      v_name,
      v_method,
      v_contact,
      v_note,
      v_total_etb,
      jsonb_build_array(
        jsonb_build_object(
          'status', 'Pending',
          'timestamp', v_now,
          'note', 'Order request submitted by customer. Stock validated; not deducted while pending.'
        )
      ),
      v_now;
  ELSE
    INSERT INTO public.orders (
      reference_code,
      customer_name,
      contact_method,
      contact_value,
      note,
      status,
      total_etb,
      stock_deducted,
      stock_restored,
      history,
      created_at,
      updated_at
    ) VALUES (
      v_ref,
      v_name,
      v_method,
      v_contact,
      v_note,
      'pending',
      v_total_etb,
      false,
      false,
      jsonb_build_array(
        jsonb_build_object(
          'status', 'Pending',
          'timestamp', v_now,
          'note', 'Order request submitted by customer. Stock validated; not deducted while pending.'
        )
      ),
      v_now,
      v_now
    )
    RETURNING id INTO v_order_id;
  END IF;

  -- 7. Insert order_items snapshots using authoritative product fields
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      sum((elem->>'quantity')::integer)::integer AS requested_qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'product_id') IS NOT NULL
      AND (elem->>'quantity') ~ '^\d+$'
    GROUP BY (elem->>'product_id')::uuid
  LOOP
    SELECT
      id,
      name,
      price_etb,
      net_weight_g,
      roast_profile
    INTO v_product
    FROM public.products
    WHERE id = v_item.product_id;

    v_line_total := round((v_product.price_etb * v_item.requested_qty)::numeric, 2);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      roast_profile,
      net_weight_g,
      unit_price_etb,
      quantity,
      line_total_etb,
      created_at
    ) VALUES (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.roast_profile,
      coalesce(v_product.net_weight_g, 250),
      v_product.price_etb,
      v_item.requested_qty,
      v_line_total,
      v_now
    );

    v_items_summary := v_items_summary || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product.id,
        'name', v_product.name,
        'roastProfile', v_product.roast_profile,
        'weight', coalesce(v_product.net_weight_g, 250)::text || 'g',
        'price', v_product.price_etb,
        'quantity', v_item.requested_qty
      )
    );
  END LOOP;

  -- 8. Return non-sensitive confirmation summary (omits contact_value)
  RETURN jsonb_build_object(
    'id', v_order_id,
    'reference', v_ref,
    'status', 'Pending',
    'createdAt', v_now,
    'customerName', v_name,
    'contactMethod', v_method,
    'totalAmount', v_total_etb,
    'items', v_items_summary,
    'message', 'Order request submitted. Your request is pending review and is not yet a confirmed order.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_request(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_request(text, text, text, text, jsonb) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. ADMIN INVENTORY & ORDER STATUS RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 5A. CONFIRM ORDER REQUEST (Admin-only, Pending -> Confirmed, Atomic Stock Deduction)
CREATE OR REPLACE FUNCTION public.confirm_order_request(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_product record;
  v_shortages text[] := ARRAY[]::text[];
  v_deducted_notes text[] := ARRAY[]::text[];
  v_now timestamptz := now();
  v_note text;
BEGIN
  IF NOT public.is_kora_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin access is required to confirm order requests.';
  END IF;

  -- Lock the order row to prevent concurrent duplicate confirmations
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order request not found.';
  END IF;

  IF lower(coalesce(v_order.status, '')) = 'confirmed' OR v_order.stock_deducted = true THEN
    RAISE EXCEPTION 'Order is already Confirmed and its stock has already been deducted once. Duplicate deduction is prevented.';
  END IF;

  IF lower(coalesce(v_order.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Only a Pending order request can be confirmed (current status: %).', v_order.status;
  END IF;

  -- Lock all products in this order in deterministic order and verify stock BEFORE changing anything
  FOR v_item IN
    SELECT
      oi.product_id,
      max(coalesce(oi.product_name, 'Coffee SKU')) AS item_name,
      sum(oi.quantity)::integer AS requested_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    SELECT id, name, stock_quantity
    INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_shortages := array_append(
        v_shortages,
        format('%s (product no longer exists)', v_item.item_name)
      );
    ELSIF v_item.requested_qty > coalesce(v_product.stock_quantity, 0) THEN
      v_shortages := array_append(
        v_shortages,
        format(
          '%s (requested %s, only %s in stock — short by %s)',
          v_product.name,
          v_item.requested_qty,
          coalesce(v_product.stock_quantity, 0),
          v_item.requested_qty - coalesce(v_product.stock_quantity, 0)
        )
      );
    END IF;
  END LOOP;

  -- If ANY item is short, abort the entire confirmation without partial deduction
  IF array_length(v_shortages, 1) > 0 THEN
    RAISE EXCEPTION 'Confirmation rejected due to insufficient stock. Needs attention: %. No stock was deducted for any item.',
      array_to_string(v_shortages, '; ');
  END IF;

  -- All items passed stock verification: deduct each quantity once
  FOR v_item IN
    SELECT
      oi.product_id,
      max(coalesce(oi.product_name, 'Coffee SKU')) AS item_name,
      sum(oi.quantity)::integer AS requested_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity - v_item.requested_qty,
      updated_at = v_now
    WHERE id = v_item.product_id;

    v_deducted_notes := array_append(
      v_deducted_notes,
      format('-%s %s', v_item.requested_qty, v_item.item_name)
    );
  END LOOP;

  v_note := format(
    'Confirmed by admin. All items passed stock check; deducted once (%s).',
    array_to_string(v_deducted_notes, ', ')
  );

  UPDATE public.orders
  SET
    status = 'confirmed',
    stock_deducted = true,
    stock_restored = false,
    updated_at = v_now,
    history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', 'Confirmed',
        'timestamp', v_now,
        'note', v_note
      )
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status', 'Confirmed',
    'message', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_order_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_request(uuid) TO authenticated;

-- 5B. DECLINE ORDER REQUEST (Admin-only, Pending -> Declined, No Stock Change)
CREATE OR REPLACE FUNCTION public.decline_order_request(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_now timestamptz := now();
  v_note text := 'Pending request declined by admin. Stock left unchanged.';
BEGIN
  IF NOT public.is_kora_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin access is required to decline order requests.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order request not found.';
  END IF;

  IF lower(coalesce(v_order.status, '')) = 'declined' THEN
    RAISE EXCEPTION 'Order request is already marked as Declined.';
  END IF;

  IF lower(coalesce(v_order.status, '')) <> 'pending' THEN
    RAISE EXCEPTION 'Only a Pending order request can be declined (current status: %).', v_order.status;
  END IF;

  UPDATE public.orders
  SET
    status = 'declined',
    updated_at = v_now,
    history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', 'Declined',
        'timestamp', v_now,
        'note', v_note
      )
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status', 'Declined',
    'message', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_order_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_order_request(uuid) TO authenticated;

-- 5C. COMPLETE ORDER REQUEST (Admin-only, Confirmed -> Completed, No Stock Change)
CREATE OR REPLACE FUNCTION public.complete_order_request(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_now timestamptz := now();
  v_note text := 'Confirmed order marked Completed by admin. Stock left unchanged (already deducted once at confirmation).';
BEGIN
  IF NOT public.is_kora_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin access is required to complete orders.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF lower(coalesce(v_order.status, '')) = 'completed' THEN
    RAISE EXCEPTION 'Order is already marked as Completed.';
  END IF;

  IF lower(coalesce(v_order.status, '')) <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a Confirmed order can be marked Completed (current status: %).', v_order.status;
  END IF;

  UPDATE public.orders
  SET
    status = 'completed',
    updated_at = v_now,
    history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', 'Completed',
        'timestamp', v_now,
        'note', v_note
      )
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status', 'Completed',
    'message', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_order_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_order_request(uuid) TO authenticated;

-- 5D. CANCEL ORDER REQUEST (Admin-only, Confirmed -> Cancelled, Restores Stock Exactly Once)
CREATE OR REPLACE FUNCTION public.cancel_order_request(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_restored_notes text[] := ARRAY[]::text[];
  v_now timestamptz := now();
  v_note text;
BEGIN
  IF NOT public.is_kora_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin access is required to cancel orders.';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF lower(coalesce(v_order.status, '')) = 'cancelled' OR v_order.stock_restored = true THEN
    RAISE EXCEPTION 'Order is already Cancelled and its stock has already been restored once. Duplicate restoration is prevented.';
  END IF;

  IF lower(coalesce(v_order.status, '')) <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a Confirmed order can be cancelled to restore stock (current status: %).', v_order.status;
  END IF;

  FOR v_item IN
    SELECT
      oi.product_id,
      max(coalesce(oi.product_name, 'Coffee SKU')) AS item_name,
      sum(oi.quantity)::integer AS requested_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity + v_item.requested_qty,
      updated_at = v_now
    WHERE id = v_item.product_id;

    v_restored_notes := array_append(
      v_restored_notes,
      format('+%s %s', v_item.requested_qty, v_item.item_name)
    );
  END LOOP;

  v_note := format(
    'Confirmed order cancelled by admin. Stock restored once (%s).',
    array_to_string(v_restored_notes, ', ')
  );

  UPDATE public.orders
  SET
    status = 'cancelled',
    stock_restored = true,
    updated_at = v_now,
    history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'status', 'Cancelled',
        'timestamp', v_now,
        'note', v_note
      )
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'status', 'Cancelled',
    'message', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_request(uuid) TO authenticated;

COMMIT;
