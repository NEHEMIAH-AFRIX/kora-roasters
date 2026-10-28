# KORA Roasters — Next.js + Supabase Portfolio Concept Store

An editorial Next.js 14 (App Router) portfolio concept store for **KORA Roasters**, supporting two selectable data modes via `NEXT_PUBLIC_KORA_DATA_MODE`:
1. **`mock` mode (default)**: Uses local browser `localStorage` and fictional seed data (`KORA No. 01–03` and `Demo Customer A–C`) for zero-dependency offline testing.
2. **`supabase` mode**: Connects to your Supabase project (`public.products`, `public.orders`, `public.order_items`, `public.kora_admins`, and `public.is_kora_admin()`) with Row-Level Security (RLS) and atomic PL/pgSQL RPC functions.

---

## Beginner-Friendly Setup Guide

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure `.env.local` (Mode Switch & Public Keys)
Copy `.env.example` to `.env.local` if you have not already created `.env.local`:
```bash
cp .env.example .env.local
```

Your `.env.local` uses three public variables (never add a `service_role` key to browser code, and never commit `.env.local`):
```ini
# Choose "supabase" for live Supabase DB + Auth, or "mock" for local browser mock mode
NEXT_PUBLIC_KORA_DATA_MODE=supabase

# Your existing Supabase project URL and publishable/anon key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_or_anon_key_here
```

### Step 3: Apply the Additive SQL Migration in Supabase
The migration file is located at:
```text
supabase/migrations/20261026000001_kora_order_and_inventory_rpcs.sql
```
It is **idempotent and additive only**—it will **not** drop your existing tables (`public.products`, `public.orders`, `public.order_items`, `public.kora_admins`) or erase your seeded products or admin user.

**Option A — Apply via Supabase Dashboard (Easiest for Beginners):**
1. Open your project in the **Supabase Dashboard** and click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/migrations/20261026000001_kora_order_and_inventory_rpcs.sql`, copy the entire SQL script, and paste it into the SQL Editor.
4. Click **Run** (or press `Ctrl/Cmd + Enter`). You should see `Success. No rows returned`.

**Option B — Apply via Supabase CLI:**
```bash
npx supabase db push
```

### Step 4: Start the Next.js Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## How to Sign In as the Existing Admin & Test the Full Flow

### 1. Verify Customer Shop & Order Request Creation (`create_order_request`)
1. Visit **`/shop`** (`The collection`). Verify that active products load from `public.products` (`KORA No. 01`, `KORA No. 02`, `KORA No. 03`) with their roast profiles, `250 g` net weight, illustrative ETB prices (`price_etb`), and stock badges (`stock_quantity`).
2. Add an available coffee (e.g., `KORA No. 01`) to your cart and proceed to **`/cart`** → **`/order-request`**.
3. Enter a fictional test name (e.g., `Demo Customer A`) and **one** contact method (e.g., `demo.customer.a@example.com`) and click **Submit Order Request →**.
4. The app calls `public.create_order_request(...)` in Postgres, which:
   - Rechecks live product stock without deducting it while `pending`.
   - Computes authoritative prices and totals from `public.products` on the server.
   - Generates a unique non-sequential reference (`KR-XXXXXX`), creates the `pending` order and `order_items` snapshots, and redirects to **`/confirmation`**.
5. Verify that `/confirmation` clearly states the request is **Pending (not yet a confirmed order)** and omits full contact details from the printable summary.

### 2. Sign In as the Existing Admin (`/admin`)
1. Navigate to **`/admin`**.
2. Sign in with the email and password of your existing Supabase Auth admin user (whose user ID is in `public.kora_admins`). Public sign-up is intentionally disabled.
3. On sign-in, the server verifies both your Supabase Auth session and `public.is_kora_admin()`. Non-admin accounts are immediately signed out and denied access.

### 3. Verify Privacy & Atomic Inventory Rules in Admin (`/admin/orders`)
1. On **`/admin/orders`**, verify that full customer emails and phone numbers are **not** shown in the table/cards (displaying `"Contact details available in request."` instead).
2. Click **`Review Request →`** to open **`/admin/orders/[id]`**, where the full contact method is displayed for authorized admins only.
3. Test each atomic RPC action:
   - **Confirm (`confirm_order_request`)**: Locks the order and all requested product rows (`FOR UPDATE`), checks all quantities against `stock_quantity` before changing anything, rejects the entire confirmation if any item is short, or deducts stock once and sets status to `Confirmed`.
   - **Decline (`decline_order_request`)**: Allowed only on `Pending` orders; sets status to `Declined` and leaves stock unchanged.
   - **Complete (`complete_order_request`)**: Allowed only on `Confirmed` orders; sets status to `Completed` and leaves stock unchanged.
   - **Cancel (`cancel_order_request`)**: Allowed only on `Confirmed` orders; restores deducted stock **once** and sets status to `Cancelled`. Repeated clicks are blocked from double-restoring stock.

### 4. Switching Back to Mock Mode (`NEXT_PUBLIC_KORA_DATA_MODE=mock`)
To run offline with local browser mock data at any time, set `NEXT_PUBLIC_KORA_DATA_MODE=mock` in `.env.local` and restart `npm run dev`.
