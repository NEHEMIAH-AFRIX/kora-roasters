'use server';

/**
 * KORA Roasters — Server Actions for Protected Admin Operations (Supabase Mode)
 *
 * SECURITY GUARANTEES:
 * 1. Every action verifies the server-side Supabase Auth session AND checks
 *    `public.is_kora_admin()` before reading or mutating any admin data.
 * 2. In the Orders Dashboard list (`fetchAdminOrdersListServerAction`), customer
 *    contact values (`contact_value`) are stripped on the server so full emails
 *    or phone numbers never reach the list view.
 * 3. Order status and stock transitions execute exclusively through atomic
 *    Postgres RPC functions (`confirm_order_request`, `decline_order_request`,
 *    `complete_order_request`, `cancel_order_request`).
 * 4. Never logs customer names, emails, or phone numbers.
 */

import { verifyServerAdminSession } from '../../lib/supabase/server.js';
import {
  mapDbOrderToUi,
  mapDbProductToUi,
  mapUiProductToDbPayload,
} from '../../lib/supabase/mappers.js';

export async function checkServerAdminSessionAction() {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      authorized: false,
      user: null,
      error: check.error,
    };
  }
  return {
    authorized: true,
    user: check.user,
  };
}

export async function fetchAdminOrdersListServerAction() {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const { supabase } = check;

  const { data: orderRows, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (ordersError) {
    return {
      ok: false,
      error: `Failed to load orders from Supabase: ${ordersError.message}`,
    };
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from('order_items')
    .select('*');

  if (itemsError) {
    return {
      ok: false,
      error: `Failed to load order items from Supabase: ${itemsError.message}`,
    };
  }

  const itemsByOrder = new Map();
  for (const item of itemRows || []) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  // Redact contact_value in the list view so full email/phone is never sent to the dashboard table
  const orders = (orderRows || []).map((row) =>
    mapDbOrderToUi(row, itemsByOrder.get(row.id) || [], { redactContact: true })
  );

  return {
    ok: true,
    orders,
  };
}

export async function fetchAdminOrderDetailServerAction(orderIdOrRef) {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const { supabase } = check;
  const target = String(orderIdOrRef || '').trim();
  if (!target) {
    return { ok: false, error: 'Order identifier is required.' };
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      target
    );

  let query = supabase.from('orders').select('*');
  if (isUuid) {
    query = query.eq('id', target);
  } else {
    query = query.ilike('reference_code', target);
  }

  const { data: rows, error: orderError } = await query.limit(1);

  if (orderError) {
    return {
      ok: false,
      error: `Failed to load order detail from Supabase: ${orderError.message}`,
    };
  }

  const orderRow = rows && rows[0];
  if (!orderRow) {
    return {
      ok: false,
      notFound: true,
      error: 'Order request not found in Supabase.',
    };
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderRow.id);

  if (itemsError) {
    return {
      ok: false,
      error: `Failed to load order items from Supabase: ${itemsError.message}`,
    };
  }

  // Individual request detail screen is authorized to view full contact_value
  const order = mapDbOrderToUi(orderRow, itemRows || [], { redactContact: false });

  return {
    ok: true,
    order,
  };
}

export async function transitionAdminOrderStatusServerAction(orderId, nextStatus) {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const { supabase } = check;
  const normalizedTarget = String(nextStatus || '').trim().toLowerCase();

  const rpcByStatus = {
    confirmed: 'confirm_order_request',
    declined: 'decline_order_request',
    completed: 'complete_order_request',
    cancelled: 'cancel_order_request',
  };

  const rpcName = rpcByStatus[normalizedTarget];
  if (!rpcName) {
    return {
      ok: false,
      error: `Unsupported status transition target: "${nextStatus}".`,
    };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(rpcName, {
    p_order_id: orderId,
  });

  if (rpcError) {
    return {
      ok: false,
      error: rpcError.message || 'Database rejected the status transition.',
    };
  }

  // Reload the updated order detail after atomic transaction completes
  const refreshed = await fetchAdminOrderDetailServerAction(orderId);
  if (!refreshed.ok) {
    return {
      ok: true,
      order: null,
      message: rpcResult?.message || `Order status updated to ${nextStatus}.`,
    };
  }

  return {
    ok: true,
    order: refreshed.order,
    message:
      rpcResult?.message || `Order status updated to ${refreshed.order.status}.`,
  };
}

export async function fetchAdminProductsServerAction() {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const { supabase } = check;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    return {
      ok: false,
      error: `Failed to load products from Supabase: ${error.message}`,
    };
  }

  return {
    ok: true,
    products: (data || []).map(mapDbProductToUi),
  };
}

export async function saveAdminProductServerAction(productInput) {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const payload = mapUiProductToDbPayload(productInput);
  const errors = {};
  if (!payload.name) errors.name = 'Product name is required.';
  if (!payload.description)
    errors.description = 'Illustrative product description is required.';
  if (!payload.roast_profile) errors.roastProfile = 'Roast profile is required.';
  if (!Number.isFinite(payload.price_etb) || payload.price_etb <= 0) {
    errors.price = 'Price must be a number greater than 0 ETB.';
  }
  if (
    !Number.isInteger(payload.stock_quantity) ||
    payload.stock_quantity < 0
  ) {
    errors.stock = 'Stock quantity must be a non-negative integer (0 or greater).';
  }
  if (!Number.isInteger(payload.net_weight_g) || payload.net_weight_g <= 0) {
    errors.weight = 'Net weight (in grams, e.g. 250g) is required.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const { supabase } = check;

  if (productInput.id) {
    const { data, error } = await supabase
      .from('products')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productInput.id)
      .select('*')
      .single();

    if (error) {
      return {
        ok: false,
        errors: { form: `Supabase update failed: ${error.message}` },
      };
    }

    return {
      ok: true,
      product: mapDbProductToUi(data),
    };
  }

  const { data, error } = await supabase
    .from('products')
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    return {
      ok: false,
      errors: { form: `Supabase insert failed: ${error.message}` },
    };
  }

  return {
    ok: true,
    product: mapDbProductToUi(data),
  };
}

export async function updateAdminProductStockServerAction(productId, nextStock) {
  const check = await verifyServerAdminSession();
  if (!check.authorized) {
    return {
      ok: false,
      unauthorized: true,
      error: check.error,
    };
  }

  const stockNum = Number(nextStock);
  if (!Number.isInteger(stockNum) || stockNum < 0) {
    return {
      ok: false,
      error: 'Stock quantity must be a non-negative integer.',
    };
  }

  const { supabase } = check;
  const { data, error } = await supabase
    .from('products')
    .update({
      stock_quantity: stockNum,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('*')
    .single();

  if (error) {
    return {
      ok: false,
      error: `Failed to update product stock in Supabase: ${error.message}`,
    };
  }

  return {
    ok: true,
    product: mapDbProductToUi(data),
  };
}
