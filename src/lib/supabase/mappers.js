/**
 * KORA Roasters — Database <-> UI Mappers
 *
 * Maps `public.products`, `public.orders`, and `public.order_items` rows from
 * Supabase while preserving both the database fields (`price_etb`, `net_weight_g`,
 * `roast_profile`, `stock_quantity`, `image_path`, `is_active`) and the existing
 * UI component fields (`price`, `weight`, `roastProfile`, `stock`, `image`, `active`).
 */

export function formatStatusTitleCase(rawStatus) {
  const s = String(rawStatus || 'pending').trim().toLowerCase();
  switch (s) {
    case 'confirmed':
      return 'Confirmed';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
    default:
      return 'Pending';
  }
}

export function parseWeightGrams(weightInput) {
  if (typeof weightInput === 'number' && Number.isFinite(weightInput)) {
    return Math.max(1, Math.round(weightInput));
  }
  const match = String(weightInput || '250g').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 250;
}

export function mapDbProductToUi(row) {
  if (!row) return null;
  const priceEtb = Number(row.price_etb ?? row.price ?? 0);
  const netWeightG = Number(row.net_weight_g ?? parseWeightGrams(row.weight));
  const roastProfile = row.roast_profile ?? row.roastProfile ?? 'Medium Roast';
  const stockQuantity = Number(row.stock_quantity ?? row.stock ?? 0);
  const imagePath = row.image_path ?? row.image ?? '/images/kora-bag-default.svg';
  const isActive =
    row.is_active !== undefined
      ? Boolean(row.is_active)
      : row.active !== undefined
      ? Boolean(row.active)
      : true;

  return {
    id: row.id,
    sku: row.sku || `KORA-${String(row.id).slice(0, 4).toUpperCase()}-${netWeightG}`,
    name: row.name || 'KORA Coffee Release',
    description: row.description || '',
    // Canonical Supabase DB columns
    price_etb: priceEtb,
    net_weight_g: netWeightG,
    roast_profile: roastProfile,
    stock_quantity: stockQuantity,
    image_path: imagePath,
    is_active: isActive,
    // Existing UI aliases
    price: priceEtb,
    weight: `${netWeightG}g`,
    roastProfile,
    stock: stockQuantity,
    image: imagePath,
    active: isActive,
  };
}

export function mapUiProductToDbPayload(input) {
  const priceEtb = Number(input.price_etb ?? input.price);
  const netWeightG = parseWeightGrams(input.net_weight_g ?? input.weight);
  const roastProfile = String(input.roast_profile ?? input.roastProfile ?? '').trim();
  const stockQuantity = parseInt(input.stock_quantity ?? input.stock, 10);
  const imagePath = String(
    input.image_path ?? input.image ?? '/images/kora-bag-default.svg'
  ).trim();
  const isActive =
    input.is_active !== undefined
      ? Boolean(input.is_active)
      : input.active !== undefined
      ? Boolean(input.active)
      : true;

  return {
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    price_etb: priceEtb,
    net_weight_g: netWeightG,
    roast_profile: roastProfile,
    stock_quantity: stockQuantity,
    image_path: imagePath,
    is_active: isActive,
  };
}

export function mapDbOrderToUi(orderRow, itemRows = [], { redactContact = false } = {}) {
  if (!orderRow) return null;
  const statusTitle = formatStatusTitleCase(orderRow.status);
  const reference =
    orderRow.reference_code ||
    orderRow.reference ||
    `KR-${String(orderRow.id).slice(0, 6).toUpperCase()}`;

  const mappedItems = (itemRows || []).map((item) => {
    const unitPrice = Number(item.unit_price_etb ?? item.price_etb ?? item.price ?? 0);
    const weightG = Number(item.net_weight_g ?? parseWeightGrams(item.weight));
    const qty = Number(item.quantity ?? 1);
    return {
      id: item.id,
      productId: item.product_id ?? item.productId,
      name: item.product_name ?? item.name ?? 'KORA Coffee',
      roastProfile: item.roast_profile ?? item.roastProfile ?? 'Medium Roast',
      weight: `${weightG}g`,
      net_weight_g: weightG,
      price: unitPrice,
      unit_price_etb: unitPrice,
      quantity: qty,
      line_total_etb: Number(item.line_total_etb ?? unitPrice * qty),
    };
  });

  const computedTotal = mappedItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );
  const totalAmount = Number(
    orderRow.total_etb ?? orderRow.total_amount ?? computedTotal
  );

  const stockDeducted =
    orderRow.stock_deducted !== undefined
      ? Boolean(orderRow.stock_deducted)
      : ['Confirmed', 'Completed', 'Cancelled'].includes(statusTitle);

  const stockRestored =
    orderRow.stock_restored !== undefined
      ? Boolean(orderRow.stock_restored)
      : statusTitle === 'Cancelled';

  const history = Array.isArray(orderRow.history) && orderRow.history.length > 0
    ? orderRow.history
    : [
        {
          status: statusTitle,
          timestamp: orderRow.updated_at || orderRow.created_at || new Date().toISOString(),
          note: `Order status is ${statusTitle}.`,
        },
      ];

  return {
    id: orderRow.id,
    reference,
    customerName: orderRow.customer_name || orderRow.customerName || 'Customer',
    contactMethod: orderRow.contact_method || orderRow.contactMethod || 'email',
    contactValue: redactContact
      ? 'Contact details available in request.'
      : orderRow.contact_value || orderRow.contactValue || '',
    note: orderRow.note || orderRow.customer_note || '',
    status: statusTitle,
    rawStatus: String(orderRow.status || 'pending').toLowerCase(),
    stockDeducted,
    stockRestored,
    createdAt: orderRow.created_at || orderRow.createdAt || new Date().toISOString(),
    updatedAt: orderRow.updated_at || orderRow.updatedAt || new Date().toISOString(),
    items: mappedItems,
    totalAmount,
    total_etb: totalAmount,
    history,
  };
}
