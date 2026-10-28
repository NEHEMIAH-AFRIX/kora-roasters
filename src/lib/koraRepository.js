/**
 * KORA Roasters — Dual-Mode Repository (`mock` & `supabase`)
 *
 * ARCHITECTURE & PRIVACY NOTE:
 * - Controlled by `NEXT_PUBLIC_KORA_DATA_MODE` (`mock` default, or `supabase`).
 * - In `mock` mode, data is stored in browser `localStorage` using fictional seed records.
 * - In `supabase` mode:
 *   1. Active products are loaded from `public.products`.
 *   2. Customer order requests are submitted via the `public.create_order_request` RPC,
 *      which validates stock and calculates prices/totals on the database side.
 *   3. Admin authentication uses Supabase Auth + `public.is_kora_admin()` and atomic
 *      RPCs (`confirm_order_request`, `decline_order_request`, `complete_order_request`,
 *      `cancel_order_request`).
 * - Never logs customer names, email addresses, or phone numbers to the console.
 */

import { SEED_PRODUCTS, SEED_ORDERS } from './seedData.js';
import { getDataMode, isSupabaseMode } from './supabase/config.js';
import { createKoraBrowserClient } from './supabase/client.js';
import { mapDbProductToUi, parseWeightGrams } from './supabase/mappers.js';

const STORAGE_KEYS = {
  PRODUCTS: 'kora_v1_products',
  SUPABASE_PRODUCTS_CACHE: 'kora_v1_supabase_products_cache',
  ORDERS: 'kora_v1_orders',
  CART: 'kora_v1_cart',
  ADMIN_SESSION: 'kora_v1_admin_session',
  LAST_CONFIRMATION_SUMMARY: 'kora_v1_last_confirmation_summary',
};

export const ORDER_STATUSES = [
  'Pending',
  'Confirmed',
  'Completed',
  'Declined',
  'Cancelled',
];

export { getDataMode, isSupabaseMode };

function cloneSeed(data) {
  return JSON.parse(JSON.stringify(data));
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function hasSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function notifyStoreUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('kora-store-updated'));
  }
}

/**
 * Masks a contact value so full email addresses or phone numbers are never
 * exposed in list views or summaries.
 */
export function maskContactValue(contactMethod, contactValue) {
  const raw = String(contactValue || '').trim();
  if (!raw) return 'Contact details available in request.';
  if (contactMethod === 'email' && raw.includes('@')) {
    const [user, domain] = raw.split('@');
    const safeUser = user.length > 1 ? `${user[0]}•••` : '•••';
    return `${safeUser}@${domain || 'example.com'}`;
  }
  const digits = raw.replace(/\D/g, '');
  const tail = digits.slice(-2) || '••';
  return `•••-•••-••${tail}`;
}

/**
 * Ensures any previously cached seed order records in localStorage use the
 * clearly fictional "Demo Customer A/B/C" and "@example.com" seed values.
 */
function sanitizeSeedOrders(orders) {
  if (!Array.isArray(orders)) return cloneSeed(SEED_ORDERS);
  const seedLookup = new Map(SEED_ORDERS.map((s) => [s.id, s]));
  let mutated = false;

  const cleaned = orders.map((order) => {
    const matchingSeed = seedLookup.get(order.id);
    if (!matchingSeed) return order;
    if (
      order.customerName !== matchingSeed.customerName ||
      order.contactMethod !== matchingSeed.contactMethod ||
      order.contactValue !== matchingSeed.contactValue
    ) {
      mutated = true;
      return {
        ...order,
        customerName: matchingSeed.customerName,
        contactMethod: matchingSeed.contactMethod,
        contactValue: matchingSeed.contactValue,
      };
    }
    return order;
  });

  if (mutated && isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(cleaned));
  }
  return cleaned;
}

// ============================================================================
// STOCK STATUS HELPERS
// ============================================================================
export function getStockBadgeInfo(stock) {
  const qty = Math.max(0, Number(stock) || 0);
  if (qty <= 0) {
    return {
      status: 'out',
      label: 'OUT OF STOCK',
      shortLabel: 'OUT OF STOCK',
      buttonLabel: 'OUT OF STOCK',
      available: false,
    };
  }
  if (qty <= 5) {
    return {
      status: 'low',
      label: `LOW STOCK · ${qty} LEFT`,
      shortLabel: `LOW STOCK · ${qty} LEFT`,
      buttonLabel: 'Add to Cart',
      available: true,
    };
  }
  return {
    status: 'in',
    label: 'IN STOCK',
    shortLabel: 'IN STOCK',
    buttonLabel: 'Add to Cart',
    available: true,
  };
}

export function formatETB(amount) {
  const num = Number(amount) || 0;
  return `ETB ${num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// ============================================================================
// PRODUCTS REPOSITORY (MOCK + SUPABASE)
// ============================================================================
export function cacheSupabaseProducts(products = []) {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    STORAGE_KEYS.SUPABASE_PRODUCTS_CACHE,
    JSON.stringify(products)
  );
  notifyStoreUpdate();
}

export function getCachedSupabaseProducts() {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.SUPABASE_PRODUCTS_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getProducts({ includeInactive = false } = {}) {
  if (isSupabaseMode()) {
    const cached = getCachedSupabaseProducts();
    return includeInactive ? cached : cached.filter((p) => p.active);
  }

  if (!isBrowser()) {
    const fallback = cloneSeed(SEED_PRODUCTS);
    return includeInactive ? fallback : fallback.filter((p) => p.active);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    let products;
    if (!raw) {
      products = cloneSeed(SEED_PRODUCTS).map(mapDbProductToUi);
      window.localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    } else {
      products = JSON.parse(raw).map(mapDbProductToUi);
    }
    return includeInactive ? products : products.filter((p) => p.active);
  } catch (err) {
    const fallback = cloneSeed(SEED_PRODUCTS).map(mapDbProductToUi);
    return includeInactive ? fallback : fallback.filter((p) => p.active);
  }
}

export function getProductById(productId, { includeInactive = false } = {}) {
  if (!productId) return null;
  const all = getProducts({ includeInactive: true });
  const target = String(productId).trim().toLowerCase();
  const found = all.find(
    (p) =>
      String(p.id).toLowerCase() === target ||
      String(p.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') === target
  );
  if (!found) return null;
  if (!includeInactive && !found.active) return null;
  return found;
}

/**
 * Loads active products from `public.products` in `supabase` mode, or from
 * local mock storage in `mock` mode. Never silently falls back to mock data
 * if a Supabase query fails.
 */
export async function fetchActiveProductsAsync() {
  if (!isSupabaseMode()) {
    return {
      ok: true,
      mode: 'mock',
      products: getProducts({ includeInactive: false }),
    };
  }

  try {
    const supabase = createKoraBrowserClient();
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, name, description, price_etb, net_weight_g, roast_profile, stock_quantity, image_path, is_active'
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return {
        ok: false,
        mode: 'supabase',
        products: [],
        error: `Could not load products from Supabase: ${error.message}`,
      };
    }

    const mapped = (data || []).map(mapDbProductToUi);
    cacheSupabaseProducts(mapped);

    return {
      ok: true,
      mode: 'supabase',
      products: mapped,
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'supabase',
      products: [],
      error: err?.message || 'Unable to connect to Supabase to load products.',
    };
  }
}

export async function fetchProductByIdAsync(productId) {
  if (!isSupabaseMode()) {
    const product = getProductById(productId, { includeInactive: false });
    if (!product) {
      return {
        ok: false,
        mode: 'mock',
        notFound: true,
        error: 'Product not found.',
      };
    }
    return {
      ok: true,
      mode: 'mock',
      product,
    };
  }

  try {
    const supabase = createKoraBrowserClient();
    const target = String(productId || '').trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        target
      );

    if (isUuid) {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, description, price_etb, net_weight_g, roast_profile, stock_quantity, image_path, is_active'
        )
        .eq('id', target)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          mode: 'supabase',
          error: `Could not load product from Supabase: ${error.message}`,
        };
      }

      if (!data) {
        return {
          ok: false,
          mode: 'supabase',
          notFound: true,
          error: 'Product is not available.',
        };
      }

      const mapped = mapDbProductToUi(data);
      const existing = getCachedSupabaseProducts();
      const updated = existing.some((p) => p.id === mapped.id)
        ? existing.map((p) => (p.id === mapped.id ? mapped : p))
        : [...existing, mapped];
      cacheSupabaseProducts(updated);

      return {
        ok: true,
        mode: 'supabase',
        product: mapped,
      };
    }

    // Fallback when navigating via slug like "kora-no-01"
    const allRes = await fetchActiveProductsAsync();
    if (!allRes.ok) {
      return allRes;
    }

    const normalizedSlug = target.toLowerCase();
    const match = allRes.products.find(
      (p) =>
        String(p.id).toLowerCase() === normalizedSlug ||
        String(p.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') === normalizedSlug
    );

    if (!match) {
      return {
        ok: false,
        mode: 'supabase',
        notFound: true,
        error: 'Product not found in active catalog.',
      };
    }

    return {
      ok: true,
      mode: 'supabase',
      product: match,
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'supabase',
      error: err?.message || 'Unable to load product from Supabase.',
    };
  }
}

export function validateProductInput(input) {
  const errors = {};
  const name = (input.name || '').trim();
  const description = (input.description || '').trim();
  const weight = (input.weight || '').trim();
  const roastProfile = (input.roastProfile || input.roast_profile || '').trim();
  const priceNum = Number(input.price_etb ?? input.price);
  const stockNum = Number(input.stock_quantity ?? input.stock);

  if (!name) errors.name = 'Product name is required.';
  if (!description) errors.description = 'Illustrative product description is required.';
  if (!weight && !input.net_weight_g)
    errors.weight = 'Net weight (e.g., 250g) is required.';
  if (!roastProfile) errors.roastProfile = 'Roast profile is required.';

  if (
    input.price === '' ||
    input.price === null ||
    Number.isNaN(priceNum) ||
    priceNum <= 0
  ) {
    errors.price = 'Price must be a number greater than 0 ETB.';
  }

  if (
    input.stock === '' ||
    input.stock === null ||
    Number.isNaN(stockNum) ||
    !Number.isInteger(stockNum) ||
    stockNum < 0
  ) {
    errors.stock = 'Stock quantity must be a non-negative integer (0 or greater).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function saveProduct(productData) {
  const validation = validateProductInput(productData);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const products = getProducts({ includeInactive: true });
  const priceNum = Number(productData.price_etb ?? productData.price);
  const stockNum = parseInt(productData.stock_quantity ?? productData.stock, 10);
  const netWeightG = parseWeightGrams(productData.net_weight_g ?? productData.weight);
  const roastProfile = String(
    productData.roast_profile ?? productData.roastProfile
  ).trim();
  const imagePath = String(
    productData.image_path ?? productData.image ?? '/images/kora-bag-default.svg'
  ).trim();
  const isActive =
    productData.is_active !== undefined
      ? Boolean(productData.is_active)
      : productData.active !== undefined
      ? Boolean(productData.active)
      : true;

  let savedProduct;
  if (productData.id) {
    const idx = products.findIndex((p) => p.id === productData.id);
    if (idx === -1) {
      return { ok: false, errors: { form: 'Product not found.' } };
    }
    savedProduct = mapDbProductToUi({
      ...products[idx],
      name: productData.name.trim(),
      description: productData.description.trim(),
      price_etb: priceNum,
      net_weight_g: netWeightG,
      roast_profile: roastProfile,
      stock_quantity: stockNum,
      image_path: imagePath,
      is_active: isActive,
    });
    products[idx] = savedProduct;
  } else {
    const slugBase = productData.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const id = `${slugBase || 'kora-sku'}-${uniqueSuffix}`;
    savedProduct = mapDbProductToUi({
      id,
      sku: `KORA-${uniqueSuffix.toUpperCase()}-${netWeightG}`,
      name: productData.name.trim(),
      description: productData.description.trim(),
      price_etb: priceNum,
      net_weight_g: netWeightG,
      roast_profile: roastProfile,
      stock_quantity: stockNum,
      image_path: imagePath,
      is_active: isActive,
    });
    products.push(savedProduct);
  }

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    notifyStoreUpdate();
  }
  return { ok: true, product: savedProduct };
}

export function updateProductStock(productId, nextStock) {
  const stockNum = Number(nextStock);
  if (Number.isNaN(stockNum) || !Number.isInteger(stockNum) || stockNum < 0) {
    return { ok: false, error: 'Stock quantity must be a non-negative integer.' };
  }
  const products = getProducts({ includeInactive: true });
  const idx = products.findIndex((p) => p.id === productId);
  if (idx === -1) {
    return { ok: false, error: 'Product not found.' };
  }
  products[idx] = mapDbProductToUi({
    ...products[idx],
    stock_quantity: stockNum,
    stock: stockNum,
  });
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    notifyStoreUpdate();
  }
  return { ok: true, product: products[idx] };
}

// ============================================================================
// CART REPOSITORY
// ============================================================================
export function getCart() {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.CART);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

export function getCartWithProducts() {
  const rawCart = getCart();
  const products = getProducts({ includeInactive: true });
  const detailedItems = [];
  let subtotal = 0;
  let totalQuantity = 0;
  let hasStockConflict = false;

  for (const item of rawCart) {
    const product = products.find((p) => p.id === item.productId);
    if (!product || !product.active) {
      hasStockConflict = true;
      continue;
    }
    const exceedsStock = item.quantity > product.stock || product.stock <= 0;
    if (exceedsStock) {
      hasStockConflict = true;
    }
    const lineTotal = product.price * item.quantity;
    subtotal += lineTotal;
    totalQuantity += item.quantity;
    detailedItems.push({
      productId: product.id,
      quantity: item.quantity,
      product,
      lineTotal,
      exceedsStock,
      maxAvailable: product.stock,
    });
  }

  return {
    items: detailedItems,
    subtotal,
    totalQuantity,
    hasStockConflict,
  };
}

export function addToCart(productId, quantityToAdd = 1) {
  const qty = parseInt(quantityToAdd, 10);
  if (Number.isNaN(qty) || qty <= 0) {
    return { ok: false, error: 'Please select a valid quantity.' };
  }
  const product = getProductById(productId);
  if (!product) {
    return { ok: false, error: 'Product is not available.' };
  }
  if (product.stock <= 0) {
    return { ok: false, error: `${product.name} is currently Out of Stock.` };
  }

  const cart = getCart();
  const existingIdx = cart.findIndex((i) => i.productId === product.id);
  const currentInCart = existingIdx >= 0 ? cart[existingIdx].quantity : 0;
  const desiredTotal = currentInCart + qty;

  if (desiredTotal > product.stock) {
    return {
      ok: false,
      error: `Cannot add ${qty} more. Only ${product.stock} unit(s) of ${product.name} in stock (${currentInCart} already in your cart).`,
    };
  }

  if (existingIdx >= 0) {
    cart[existingIdx].quantity = desiredTotal;
  } else {
    cart.push({ productId: product.id, quantity: qty });
  }

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    notifyStoreUpdate();
  }
  return { ok: true, cart };
}

export function updateCartQuantity(productId, newQuantity) {
  const qty = parseInt(newQuantity, 10);
  if (Number.isNaN(qty) || qty <= 0) {
    return removeFromCart(productId);
  }
  const product = getProductById(productId, { includeInactive: true });
  if (!product) {
    return { ok: false, error: 'Product not found.' };
  }
  if (qty > product.stock) {
    return {
      ok: false,
      error: `Only ${product.stock} unit(s) of ${product.name} available in stock.`,
    };
  }

  const cart = getCart();
  const idx = cart.findIndex((i) => i.productId === product.id);
  if (idx >= 0) {
    cart[idx].quantity = qty;
  } else {
    cart.push({ productId: product.id, quantity: qty });
  }

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    notifyStoreUpdate();
  }
  return { ok: true, cart };
}

export function removeFromCart(productId) {
  const cart = getCart().filter((i) => i.productId !== productId);
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    notifyStoreUpdate();
  }
  return { ok: true, cart };
}

export function clearCart() {
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify([]));
    notifyStoreUpdate();
  }
}

// ============================================================================
// CONFIRMATION SUMMARY SESSION CACHE (PRIVACY-SAFE, NO CONTACT VALUE)
// ============================================================================
export function saveConfirmationSummarySession(orderSummary) {
  if (!hasSessionStorage() || !orderSummary) return;
  const redacted = {
    id: orderSummary.id,
    reference: orderSummary.reference,
    status: orderSummary.status || 'Pending',
    createdAt: orderSummary.createdAt || new Date().toISOString(),
    customerName: orderSummary.customerName || 'Customer',
    contactMethod: orderSummary.contactMethod || 'email',
    totalAmount: Number(orderSummary.totalAmount ?? orderSummary.total_etb ?? 0),
    items: Array.isArray(orderSummary.items) ? orderSummary.items : [],
    message:
      orderSummary.message ||
      'Your request is Pending review and is not yet a confirmed order.',
  };
  window.sessionStorage.setItem(
    STORAGE_KEYS.LAST_CONFIRMATION_SUMMARY,
    JSON.stringify(redacted)
  );
}

export function getConfirmationSummarySession(ref) {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEYS.LAST_CONFIRMATION_SUMMARY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!ref) return parsed;
    if (
      String(parsed.reference || '').toUpperCase() ===
        String(ref).trim().toUpperCase() ||
      String(parsed.id || '').toUpperCase() === String(ref).trim().toUpperCase()
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// ORDERS REPOSITORY & UNIQUE REFERENCE GENERATION
// ============================================================================
export function getOrders() {
  if (!isBrowser()) return cloneSeed(SEED_ORDERS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (!raw) {
      const initial = cloneSeed(SEED_ORDERS);
      window.localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return sanitizeSeedOrders(parsed);
  } catch (err) {
    return cloneSeed(SEED_ORDERS);
  }
}

export function getOrderByIdOrRef(idOrRef) {
  const fromSession = getConfirmationSummarySession(idOrRef);
  if (isSupabaseMode()) {
    return fromSession;
  }
  if (!idOrRef) return fromSession;
  const orders = getOrders();
  const target = String(idOrRef).trim().toUpperCase();
  return (
    orders.find(
      (o) =>
        o.id.toUpperCase() === target ||
        o.reference.toUpperCase() === target
    ) ||
    fromSession ||
    null
  );
}

/**
 * Generates a unique, non-sequential order request reference like KR-A7F29C.
 */
export function generateUniqueOrderReference(existingOrders = []) {
  const existingRefs = new Set(existingOrders.map((o) => o.reference.toUpperCase()));
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let ref = '';
  do {
    let token = '';
    for (let i = 0; i < 6; i += 1) {
      const randIdx = Math.floor(Math.random() * chars.length);
      token += chars[randIdx];
    }
    ref = `KR-${token}`;
  } while (existingRefs.has(ref));
  return ref;
}

export function validateOrderRequestForm({ customerName, contactMethod, contactValue }) {
  const errors = {};
  const trimmedName = (customerName || '').trim();
  const method = contactMethod === 'phone' ? 'phone' : 'email';
  const trimmedContact = (contactValue || '').trim();

  if (!trimmedName || trimmedName.length < 2) {
    errors.customerName = 'Please enter a name (at least 2 characters).';
  }

  if (!trimmedContact) {
    errors.contactValue =
      method === 'email'
        ? 'Please enter an email address so we can follow up on this request.'
        : 'Please enter a phone number so we can follow up on this request.';
  } else if (method === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedContact)) {
      errors.contactValue = 'Please enter a valid email address (e.g., demo.customer@example.com).';
    }
  } else {
    const digitsOnly = trimmedContact.replace(/[\s\-()+]/g, '');
    if (!/^\d{7,15}$/.test(digitsOnly)) {
      errors.contactValue = 'Please enter a valid phone number (7–15 digits).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Synchronous Mock-Mode Order Request Creation
 */
export function createOrderRequest({ customerName, contactMethod, contactValue, note }) {
  const validation = validateOrderRequestForm({
    customerName,
    contactMethod,
    contactValue,
  });
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const cartDetails = getCartWithProducts();
  if (cartDetails.items.length === 0) {
    return {
      ok: false,
      errors: { cart: 'Your cart is empty. Please add at least one product before submitting.' },
    };
  }

  const products = getProducts({ includeInactive: true });
  for (const item of cartDetails.items) {
    const liveProduct = products.find((p) => p.id === item.productId);
    if (!liveProduct || !liveProduct.active) {
      return {
        ok: false,
        errors: {
          cart: `${item.product.name} is no longer available. Please remove it from your cart.`,
        },
      };
    }
    if (liveProduct.stock <= 0) {
      return {
        ok: false,
        errors: {
          cart: `${liveProduct.name} is currently Out of Stock. Please remove it from your cart.`,
        },
      };
    }
    if (item.quantity > liveProduct.stock) {
      return {
        ok: false,
        errors: {
          cart: `Requested quantity (${item.quantity}) for ${liveProduct.name} exceeds available stock (${liveProduct.stock}). Please update your cart.`,
        },
      };
    }
  }

  const orders = getOrders();
  const reference = generateUniqueOrderReference(orders);
  const nowIso = new Date().toISOString();

  const newOrder = {
    id: `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    reference,
    customerName: customerName.trim(),
    contactMethod: contactMethod === 'phone' ? 'phone' : 'email',
    contactValue: contactValue.trim(),
    note: (note || '').trim(),
    status: 'Pending',
    stockDeducted: false,
    stockRestored: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    items: cartDetails.items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      weight: item.product.weight,
      roastProfile: item.product.roastProfile,
      price: item.product.price,
      quantity: item.quantity,
    })),
    totalAmount: cartDetails.subtotal,
    history: [
      {
        status: 'Pending',
        timestamp: nowIso,
        note: 'Order request submitted by customer. Stock validated; not deducted while Pending.',
      },
    ],
  };

  const updatedOrders = [newOrder, ...orders];
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(updatedOrders));
    saveConfirmationSummarySession(newOrder);
    clearCart();
    notifyStoreUpdate();
  }

  return { ok: true, order: newOrder };
}

/**
 * Dual-Mode Order Request Submission (`mock` vs `supabase`):
 * - In `mock` mode: delegates to `createOrderRequest`.
 * - In `supabase` mode: calls `public.create_order_request` RPC, passing ONLY
 *   customer name, single contact method/value, optional note, and `{ product_id, quantity }`.
 *   Prices, totals, stock validation, status (`pending`), and reference (`KR-XXXXXX`)
 *   are computed authoritatively by Postgres.
 */
export async function submitOrderRequestAsync({
  customerName,
  contactMethod,
  contactValue,
  note,
}) {
  const validation = validateOrderRequestForm({
    customerName,
    contactMethod,
    contactValue,
  });
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  if (!isSupabaseMode()) {
    return createOrderRequest({ customerName, contactMethod, contactValue, note });
  }

  const rawCart = getCart();
  if (rawCart.length === 0) {
    return {
      ok: false,
      errors: {
        cart: 'Your cart is empty. Please add at least one product before submitting.',
      },
    };
  }

  // Send only product_id and quantity — never send client prices, totals, status, or reference
  const rpcItems = rawCart.map((item) => ({
    product_id: item.productId,
    quantity: Number(item.quantity) || 1,
  }));

  try {
    const supabase = createKoraBrowserClient();
    const { data, error } = await supabase.rpc('create_order_request', {
      p_customer_name: customerName.trim(),
      p_contact_method: contactMethod === 'phone' ? 'phone' : 'email',
      p_contact_value: contactValue.trim(),
      p_note: (note || '').trim(),
      p_items: rpcItems,
    });

    if (error) {
      return {
        ok: false,
        errors: {
          form: error.message || 'Database rejected the order request.',
        },
      };
    }

    if (!data || !data.reference) {
      return {
        ok: false,
        errors: {
          form: 'Order request did not return a valid reference from Supabase.',
        },
      };
    }

    saveConfirmationSummarySession(data);
    clearCart();
    return {
      ok: true,
      order: data,
    };
  } catch (err) {
    return {
      ok: false,
      errors: {
        form: err?.message || 'Unable to submit order request to Supabase.',
      },
    };
  }
}

/**
 * Mock-Mode Admin Order Status Transition & Strict Stock Rules
 */
export function updateOrderStatus(orderIdOrRef, nextStatus) {
  if (!ORDER_STATUSES.includes(nextStatus)) {
    return { ok: false, error: `Invalid order status: ${nextStatus}` };
  }

  const orders = getOrders();
  const target = String(orderIdOrRef).trim().toUpperCase();
  const orderIdx = orders.findIndex(
    (o) => o.id.toUpperCase() === target || o.reference.toUpperCase() === target
  );

  if (orderIdx === -1) {
    return { ok: false, error: 'Order request not found.' };
  }

  const order = { ...orders[orderIdx] };
  const currentStatus = order.status;

  if (currentStatus === nextStatus) {
    if (currentStatus === 'Confirmed') {
      return {
        ok: false,
        error:
          'Order is already Confirmed and its stock has already been deducted once. Duplicate deduction is prevented.',
      };
    }
    if (currentStatus === 'Cancelled') {
      return {
        ok: false,
        error:
          'Order is already Cancelled and its stock has already been restored once. Duplicate restoration is prevented.',
      };
    }
    return {
      ok: false,
      error: `Order is already marked as ${nextStatus}. Duplicate status update prevented.`,
    };
  }

  const allowedTransitions = {
    Pending: ['Confirmed', 'Declined'],
    Confirmed: ['Completed', 'Cancelled'],
    Completed: [],
    Declined: [],
    Cancelled: [],
  };

  const allowed = allowedTransitions[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      error: `Cannot transition order from "${currentStatus}" to "${nextStatus}". ${
        currentStatus === 'Cancelled'
          ? 'Stock for this cancelled order has already been restored once and cannot be altered again.'
          : currentStatus === 'Pending' && nextStatus === 'Cancelled'
          ? 'Pending requests have not deducted stock yet; use "Declined" to reject a Pending request without changing stock.'
          : `Allowed next status from ${currentStatus}: ${
              allowed.length ? allowed.join(' or ') : 'None (terminal state)'
            }.`
      }`,
    };
  }

  const products = getProducts({ includeInactive: true });
  const nowIso = new Date().toISOString();
  let stockHistoryNote = '';

  if (currentStatus === 'Pending' && nextStatus === 'Confirmed') {
    if (order.stockDeducted) {
      return {
        ok: false,
        error: 'Stock for this order was already deducted once. Duplicate deduction is blocked.',
      };
    }

    const requiredByProduct = new Map();
    for (const item of order.items) {
      const prev = requiredByProduct.get(item.productId) || {
        productId: item.productId,
        name: item.name,
        quantity: 0,
      };
      prev.quantity += Number(item.quantity) || 0;
      requiredByProduct.set(item.productId, prev);
    }

    const shortages = [];
    for (const req of requiredByProduct.values()) {
      const product = products.find((p) => p.id === req.productId);
      const available = product ? Number(product.stock) || 0 : 0;
      if (!product) {
        shortages.push(`${req.name} (product no longer found in catalog)`);
      } else if (req.quantity > available) {
        shortages.push(
          `${req.name} (requested ${req.quantity}, only ${available} in stock — short by ${
            req.quantity - available
          })`
        );
      }
    }

    if (shortages.length > 0) {
      return {
        ok: false,
        error: `Confirmation rejected due to insufficient stock. Needs attention: ${shortages.join(
          '; '
        )}. No stock was deducted for any item.`,
      };
    }

    for (const req of requiredByProduct.values()) {
      const pIdx = products.findIndex((p) => p.id === req.productId);
      if (pIdx !== -1) {
        const nextStock = products[pIdx].stock - req.quantity;
        products[pIdx] = mapDbProductToUi({
          ...products[pIdx],
          stock_quantity: nextStock,
          stock: nextStock,
        });
      }
    }
    order.stockDeducted = true;
    order.stockRestored = false;
    stockHistoryNote = `Confirmed by admin. All items passed stock check; deducted once (${Array.from(
      requiredByProduct.values()
    )
      .map((i) => `-${i.quantity} ${i.name}`)
      .join(', ')}).`;
  }

  if (currentStatus === 'Pending' && nextStatus === 'Declined') {
    order.stockDeducted = false;
    stockHistoryNote = 'Pending request declined by admin. Stock left unchanged.';
  }

  if (currentStatus === 'Confirmed' && nextStatus === 'Completed') {
    stockHistoryNote =
      'Confirmed order marked Completed by admin. Stock left unchanged (already deducted once at confirmation).';
  }

  if (currentStatus === 'Confirmed' && nextStatus === 'Cancelled') {
    if (order.stockRestored) {
      return {
        ok: false,
        error: 'Stock for this order has already been restored once. Duplicate restoration is blocked.',
      };
    }
    if (order.stockDeducted) {
      const restoreByProduct = new Map();
      for (const item of order.items) {
        const prev = restoreByProduct.get(item.productId) || {
          productId: item.productId,
          name: item.name,
          quantity: 0,
        };
        prev.quantity += Number(item.quantity) || 0;
        restoreByProduct.set(item.productId, prev);
      }

      for (const req of restoreByProduct.values()) {
        const pIdx = products.findIndex((p) => p.id === req.productId);
        if (pIdx !== -1) {
          const nextStock = products[pIdx].stock + req.quantity;
          products[pIdx] = mapDbProductToUi({
            ...products[pIdx],
            stock_quantity: nextStock,
            stock: nextStock,
          });
        }
      }
      order.stockRestored = true;
      stockHistoryNote = `Confirmed order cancelled by admin. Stock restored once (${Array.from(
        restoreByProduct.values()
      )
        .map((i) => `+${i.quantity} ${i.name}`)
        .join(', ')}).`;
    } else {
      stockHistoryNote = 'Order cancelled by admin. No prior stock deduction to restore.';
    }
  }

  order.status = nextStatus;
  order.updatedAt = nowIso;
  order.history = [
    ...(order.history || []),
    {
      status: nextStatus,
      timestamp: nowIso,
      note: stockHistoryNote,
    },
  ];

  orders[orderIdx] = order;

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    window.localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    notifyStoreUpdate();
  }

  return { ok: true, order, message: stockHistoryNote };
}

// ============================================================================
// DEMO ADMIN GATE (MOCK MODE ONLY)
// ============================================================================
export function getAdminSession() {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function signInAdminDemo({ label = 'Demo Reviewer' } = {}) {
  const session = {
    isDemoAdmin: true,
    label: label.trim() || 'Demo Reviewer',
    signedInAt: new Date().toISOString(),
  };
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, JSON.stringify(session));
    notifyStoreUpdate();
  }
  return session;
}

export function signOutAdminDemo() {
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
    notifyStoreUpdate();
  }
}

/**
 * Clears all local mock orders, cart items, and product changes in localStorage
 * and restores the documented fictional seed data (SEED_PRODUCTS and SEED_ORDERS).
 */
export function resetAllDemoData() {
  const freshProducts = cloneSeed(SEED_PRODUCTS).map(mapDbProductToUi);
  const freshOrders = cloneSeed(SEED_ORDERS);

  if (!isBrowser()) {
    return {
      ok: true,
      products: freshProducts,
      orders: freshOrders,
    };
  }

  window.localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
  window.localStorage.removeItem(STORAGE_KEYS.ORDERS);
  window.localStorage.removeItem(STORAGE_KEYS.CART);

  window.localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(freshProducts));
  window.localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(freshOrders));
  window.localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify([]));
  notifyStoreUpdate();

  return {
    ok: true,
    products: freshProducts,
    orders: freshOrders,
  };
}
