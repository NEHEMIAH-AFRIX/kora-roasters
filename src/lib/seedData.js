/**
 * KORA Roasters (V1 Concept Prototype) — Fictional Seed Data
 *
 * NOTE: All products, ETB prices, stock quantities, and order requests below
 * are fictional and illustrative for portfolio demonstration only.
 * Includes both the canonical Supabase column names (`price_etb`, `net_weight_g`,
 * `roast_profile`, `stock_quantity`, `image_path`, `is_active`) and the UI aliases.
 * Only clearly fictional demo customer names ("Demo Customer A/B/C") and
 * reserved example.com addresses are used.
 */

export const SEED_PRODUCTS = [
  {
    id: 'kora-no-01',
    sku: 'KORA-01-250',
    name: 'KORA No. 01',
    description:
      'Fictional single-SKU packaged coffee concept featuring a balanced medium roast profile intended for everyday filter and immersion routines. Sample product details and ETB pricing are illustrative.',
    price_etb: 650,
    net_weight_g: 250,
    roast_profile: 'Medium Roast',
    stock_quantity: 12,
    image_path: '/images/kora-no-01.svg',
    is_active: true,
    price: 650,
    weight: '250g',
    roastProfile: 'Medium Roast',
    image: '/images/kora-no-01.svg',
    stock: 12,
    active: true,
  },
  {
    id: 'kora-no-02',
    sku: 'KORA-02-250',
    name: 'KORA No. 02',
    description:
      'Fictional single-SKU packaged coffee concept featuring a light roast profile designed for pour-over and drip preparation. Sample product details and ETB pricing are illustrative.',
    price_etb: 720,
    net_weight_g: 250,
    roast_profile: 'Light Roast',
    stock_quantity: 3,
    image_path: '/images/kora-no-02.svg',
    is_active: true,
    price: 720,
    weight: '250g',
    roastProfile: 'Light Roast',
    image: '/images/kora-no-02.svg',
    stock: 3,
    active: true,
  },
  {
    id: 'kora-no-03',
    sku: 'KORA-03-250',
    name: 'KORA No. 03',
    description:
      'Fictional single-SKU packaged coffee concept featuring a deeper dark roast profile suited for espresso and moka pot preparation. Sample product details and ETB pricing are illustrative.',
    price_etb: 680,
    net_weight_g: 250,
    roast_profile: 'Dark Roast',
    stock_quantity: 0,
    image_path: '/images/kora-no-03.svg',
    is_active: true,
    price: 680,
    weight: '250g',
    roastProfile: 'Dark Roast',
    image: '/images/kora-no-03.svg',
    stock: 0,
    active: true,
  },
];

export const SEED_ORDERS = [
  {
    id: 'ord-seed-1',
    reference: 'KR-9B4E2A',
    customerName: 'Demo Customer A',
    contactMethod: 'email',
    contactValue: 'demo.customer.a@example.com',
    note: 'Fictional sample pending request for portfolio review (stock sufficient).',
    status: 'Pending',
    stockDeducted: false,
    stockRestored: false,
    createdAt: '2026-10-23T14:20:00.000Z',
    updatedAt: '2026-10-23T14:20:00.000Z',
    items: [
      {
        productId: 'kora-no-01',
        name: 'KORA No. 01',
        weight: '250g',
        roastProfile: 'Medium Roast',
        price: 650,
        quantity: 2,
      },
      {
        productId: 'kora-no-02',
        name: 'KORA No. 02',
        weight: '250g',
        roastProfile: 'Light Roast',
        price: 720,
        quantity: 1,
      },
    ],
    totalAmount: 2020,
    history: [
      {
        status: 'Pending',
        timestamp: '2026-10-23T14:20:00.000Z',
        note: 'Order request submitted (stock validated, not deducted while Pending).',
      },
    ],
  },
  {
    id: 'ord-seed-2',
    reference: 'KR-3C8D1F',
    customerName: 'Demo Customer B',
    contactMethod: 'email',
    contactValue: 'demo.customer.b@example.com',
    note: 'Confirmed fictional sample order — can be marked Completed or Cancelled to test single-time stock restoration.',
    status: 'Confirmed',
    stockDeducted: true,
    stockRestored: false,
    createdAt: '2026-10-22T09:15:00.000Z',
    updatedAt: '2026-10-22T11:00:00.000Z',
    items: [
      {
        productId: 'kora-no-01',
        name: 'KORA No. 01',
        weight: '250g',
        roastProfile: 'Medium Roast',
        price: 650,
        quantity: 2,
      },
    ],
    totalAmount: 1300,
    history: [
      {
        status: 'Pending',
        timestamp: '2026-10-22T09:15:00.000Z',
        note: 'Order request submitted.',
      },
      {
        status: 'Confirmed',
        timestamp: '2026-10-22T11:00:00.000Z',
        note: 'Confirmed by demo admin. Deducted 2 units of KORA No. 01.',
      },
    ],
  },
  {
    id: 'ord-seed-3',
    reference: 'KR-7E2A5B',
    customerName: 'Demo Customer C',
    contactMethod: 'email',
    contactValue: 'demo.customer.c@example.com',
    note: 'Requests 4 units of KORA No. 02 (only 3 currently in stock) to demonstrate insufficient-stock rejection on Confirm.',
    status: 'Pending',
    stockDeducted: false,
    stockRestored: false,
    createdAt: '2026-10-24T07:30:00.000Z',
    updatedAt: '2026-10-24T07:30:00.000Z',
    items: [
      {
        productId: 'kora-no-02',
        name: 'KORA No. 02',
        weight: '250g',
        roastProfile: 'Light Roast',
        price: 720,
        quantity: 4,
      },
    ],
    totalAmount: 2880,
    history: [
      {
        status: 'Pending',
        timestamp: '2026-10-24T07:30:00.000Z',
        note: 'Order request submitted while stock was higher; now tests insufficient-stock guard on confirmation.',
      },
    ],
  },
];
