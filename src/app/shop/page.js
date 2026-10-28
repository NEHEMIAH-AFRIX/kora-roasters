'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getProducts,
  fetchActiveProductsAsync,
  getCart,
  addToCart,
  formatETB,
  isSupabaseMode,
} from '../../lib/koraRepository';

const ROAST_FILTERS = [
  { id: 'All', label: 'All' },
  { id: 'Light', label: 'Light' },
  { id: 'Medium', label: 'Medium' },
  { id: 'Dark', label: 'Dark' },
];

/**
 * Formats product availability state from the real `stock_quantity` value:
 * - stock > 5: "IN STOCK" badge, Add to Cart enabled (unless cart limit reached)
 * - stock 1–5: "LOW STOCK · X LEFT" badge, Add to Cart enabled with quantity limit enforced
 * - stock = 0: "OUT OF STOCK" muted readable badge, Add to Cart disabled with "OUT OF STOCK" label
 */
export function getShopStockStatus(stockQuantity, inCartQty = 0) {
  const qty = Math.max(0, Number(stockQuantity) || 0);
  const inCart = Math.max(0, Number(inCartQty) || 0);

  if (qty <= 0) {
    return {
      code: 'out',
      badgeLabel: 'OUT OF STOCK',
      buttonLabel: 'OUT OF STOCK',
      isOutOfStock: true,
      reachedStockLimit: false,
      buttonDisabled: true,
    };
  }

  const reachedStockLimit = inCart >= qty;

  if (qty <= 5) {
    return {
      code: 'low',
      badgeLabel: `LOW STOCK · ${qty} LEFT`,
      buttonLabel: reachedStockLimit ? 'Limit Reached' : 'Add to Cart',
      isOutOfStock: false,
      reachedStockLimit,
      buttonDisabled: reachedStockLimit,
    };
  }

  return {
    code: 'in',
    badgeLabel: 'IN STOCK',
    buttonLabel: reachedStockLimit ? 'Limit Reached' : 'Add to Cart',
    isOutOfStock: false,
    reachedStockLimit,
    buttonDisabled: reachedStockLimit,
  };
}

function matchesRoastFilter(product, activeFilter) {
  if (activeFilter === 'All') return true;
  const profile = (product.roastProfile || product.roast_profile || '').toLowerCase();
  return profile.includes(activeFilter.toLowerCase());
}

function formatWeightDisplay(weight) {
  if (!weight) return '250 g';
  return String(weight).replace(/(\d+)\s*g$/i, '$1 g');
}

export default function ShopPage() {
  const supabaseActive = isSupabaseMode();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [feedback, setFeedback] = useState(null);
  const filterBtnRefs = useRef([]);

  const loadShopCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const res = await fetchActiveProductsAsync();
    if (!res.ok) {
      setProducts([]);
      setLoadError(
        res.error || 'Failed to load active products from Supabase.'
      );
    } else {
      setProducts(res.products);
    }
    setCart(getCart());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadShopCatalog();

    const syncLocal = () => {
      if (!supabaseActive) {
        setProducts(getProducts({ includeInactive: false }));
      }
      setCart(getCart());
    };
    window.addEventListener('kora-store-updated', syncLocal);
    window.addEventListener('storage', syncLocal);
    return () => {
      window.removeEventListener('kora-store-updated', syncLocal);
      window.removeEventListener('storage', syncLocal);
    };
  }, [loadShopCatalog, supabaseActive]);

  const getInCartCount = (productId) => {
    const found = cart.find((i) => i.productId === productId);
    return found ? found.quantity : 0;
  };

  const handleAddToCart = (product) => {
    const stockQty = Math.max(0, Number(product.stock_quantity ?? product.stock ?? 0));
    const inCartQty = getInCartCount(product.id);

    if (stockQty <= 0) {
      return;
    }

    if (inCartQty >= stockQty) {
      setFeedback({
        type: 'limit',
        productId: product.id,
        message: `Quantity limit reached for ${product.name} (${stockQty} available).`,
      });
      return;
    }

    const result = addToCart(product.id, 1);
    if (!result.ok) {
      setFeedback({
        type: 'limit',
        productId: product.id,
        message: result.error,
      });
    } else {
      const updatedCount = inCartQty + 1;
      setFeedback({
        type: 'added',
        productId: product.id,
        message: `Added 1 × ${product.name} to your cart (${updatedCount} of ${stockQty} in cart).`,
      });
    }
  };

  const handleFilterKeyDown = (e, index) => {
    let nextIndex = null;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % ROAST_FILTERS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + ROAST_FILTERS.length) % ROAST_FILTERS.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = ROAST_FILTERS.length - 1;
    }
    if (nextIndex !== null) {
      e.preventDefault();
      const targetFilter = ROAST_FILTERS[nextIndex];
      setActiveFilter(targetFilter.id);
      filterBtnRefs.current[nextIndex]?.focus();
    }
  };

  const filteredProducts = products.filter((p) =>
    matchesRoastFilter(p, activeFilter)
  );

  return (
    <div>
      {/* 1–3. Breadcrumb, Main Heading ("The collection"), and Calm Editorial Introduction */}
      <section className="shop-header-section" aria-labelledby="shop-main-heading">
        <nav className="shop-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">The collection</span>
        </nav>

        <div className="shop-header-top">
          <div>
            <h1 id="shop-main-heading" className="shop-headline">
              The collection
            </h1>
            <p className="shop-intro">
              Three single-SKU releases composed for unhurried daily preparation—whether
              a bright morning pour-over, a steady filter brew, or a deeper espresso
              routine. Sample product details and ETB prices are illustrative.
            </p>
          </div>

          <Link href="/cart" className="quiet-link">
            <span>Review request cart</span>
            <span className="quiet-link-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      {/* 4. Roast-Profile Filters (All, Light, Medium, Dark) */}
      <section className="shop-toolbar" aria-label="Roast profile filters">
        <div
          className="roast-filter-group"
          role="group"
          aria-label="Filter collection by roast profile"
        >
          {ROAST_FILTERS.map((filter, idx) => {
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                ref={(el) => {
                  filterBtnRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                onKeyDown={(e) => handleFilterKeyDown(e, idx)}
                aria-pressed={isActive}
                className={`roast-filter-btn ${isActive ? 'active' : ''}`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {loading ? (
            <span>Loading releases...</span>
          ) : (
            <>
              Showing <strong>{filteredProducts.length}</strong> of{' '}
              <strong>{products.length}</strong>{' '}
              {products.length === 1 ? 'release' : 'releases'}
              {activeFilter !== 'All' && (
                <>
                  {' '}
                  in <strong>{activeFilter}</strong> roast
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* Explicit Database / Network Error State (Never silently fakes success) */}
      {loadError && (
        <div
          className="alert-box"
          role="alert"
          style={{
            borderColor: 'var(--kora-espresso)',
            borderWidth: '2px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <div>
            <strong style={{ display: 'block', marginBottom: '2px' }}>
              Unable to Load Catalog
            </strong>
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadShopCatalog}
            className="btn btn-primary btn-sm"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Cart & Stock Feedback Banner */}
      {feedback && (
        <div
          className="alert-box"
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>{feedback.message}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link href="/cart" className="btn btn-primary btn-sm">
              View Cart →
            </Link>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="btn btn-neutral btn-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 5. Responsive Product Grid (Desktop 3 cols, Tablet 2 cols, Mobile 1 col) */}
      {loading ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            marginBottom: '36px',
          }}
          role="status"
        >
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            Loading active coffee releases...
          </p>
        </div>
      ) : !loadError && filteredProducts.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            marginBottom: '36px',
          }}
          role="status"
        >
          <h2
            style={{
              fontFamily:
                "'Iowan Old Style', Baskerville, 'Palatino Linotype', Georgia, serif",
              fontSize: '1.5rem',
              fontWeight: 600,
              marginBottom: '8px',
            }}
          >
            No releases match this roast profile
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              maxWidth: '440px',
              margin: '0 auto 22px',
              fontSize: '0.92rem',
            }}
          >
            There are currently no active coffees under the{' '}
            <strong>{activeFilter}</strong> filter. Return to the full collection to
            browse all available releases.
          </p>
          <button
            type="button"
            onClick={() => setActiveFilter('All')}
            className="btn btn-primary"
          >
            Return to All releases
          </button>
        </div>
      ) : (
        <div className="product-grid" style={{ marginBottom: '48px' }}>
          {filteredProducts.map((product) => {
            const stockQty = Math.max(
              0,
              Number(product.stock_quantity ?? product.stock ?? 0)
            );
            const inCartQty = getInCartCount(product.id);
            const stockInfo = getShopStockStatus(stockQty, inCartQty);
            const weightFormatted = formatWeightDisplay(
              product.weight || `${product.net_weight_g || 250}g`
            );

            return (
              <article key={product.id} className="shop-product-card">
                <div>
                  {/* Product Pack Image linking to Product Detail (Never dimmed or disabled) */}
                  <Link
                    href={`/shop/${product.id}`}
                    className="shop-card-stage"
                    aria-label={`View details for ${product.name} (${product.roastProfile}, ${weightFormatted})`}
                  >
                    <img
                      src={product.image || product.image_path || '/images/kora-bag-default.svg'}
                      alt={`${product.name} — ${product.roastProfile}, ${weightFormatted} coffee pouch`}
                      className="shop-card-image"
                    />
                  </Link>

                  {/* Roast Profile, Net Weight (250 g), and Availability Badge */}
                  <div className="shop-card-meta-row">
                    <span className="shop-card-specs">
                      {product.roastProfile} · {weightFormatted}
                    </span>
                    <span className={`badge badge-${stockInfo.code}`}>
                      {stockInfo.badgeLabel}
                    </span>
                  </div>

                  {/* Product Name */}
                  <h2 className="shop-card-title">
                    <Link href={`/shop/${product.id}`}>{product.name}</Link>
                  </h2>

                  {/* Concise Description */}
                  <p className="shop-card-desc">{product.description}</p>
                </div>

                {/* Card Footer: Illustrative Price, Optional Cart Count, Product Detail Link & Add to Cart */}
                <div className="shop-card-footer">
                  <div className="shop-card-price-row">
                    <div>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                        {formatETB(product.price_etb ?? product.price)}
                      </span>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          marginLeft: '6px',
                        }}
                      >
                        Illustrative
                      </span>
                    </div>

                    {/* Show in-cart count only when item is in stock and in cart; never repeat Out of Stock / stock status here */}
                    {!stockInfo.isOutOfStock && inCartQty > 0 && (
                      <div style={{ fontSize: '0.76rem', color: 'var(--kora-espresso)' }}>
                        <strong>
                          {inCartQty} of {stockQty} in cart
                        </strong>
                      </div>
                    )}
                  </div>

                  {stockInfo.reachedStockLimit && (
                    <p
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--kora-espresso)',
                        backgroundColor: 'var(--surface-subtle)',
                        padding: '6px 10px',
                        borderRadius: '3px',
                        marginBottom: '10px',
                        borderLeft: '2.5px solid var(--kora-espresso)',
                      }}
                      role="status"
                    >
                      Available quantity limit ({stockQty}) reached in cart.
                    </p>
                  )}

                  <div className="shop-card-actions">
                    <Link
                      href={`/shop/${product.id}`}
                      className="btn btn-outline btn-sm"
                    >
                      Product Detail
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleAddToCart(product)}
                      disabled={stockInfo.buttonDisabled}
                      className="btn btn-primary btn-sm"
                      aria-disabled={stockInfo.buttonDisabled}
                    >
                      {stockInfo.buttonLabel}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Secondary Concept Disclosure Strip matching Homepage */}
      <aside
        className="concept-disclosure-strip"
        aria-label="Portfolio concept disclosure"
      >
        <div>
          <strong style={{ color: 'var(--kora-espresso)' }}>
            Concept Store Notice:
          </strong>{' '}
          KORA No. 01, No. 02, and No. 03 are fictional single-SKU releases with
          illustrative ETB prices. No online payment is collected.
        </div>
        <Link
          href="/cart"
          className="quiet-link"
          style={{ padding: '4px 0', fontSize: '0.8rem' }}
        >
          <span>Proceed to Request Cart</span>
          <span className="quiet-link-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </aside>
    </div>
  );
}
