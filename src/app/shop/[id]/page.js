'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  getProductById,
  fetchProductByIdAsync,
  getCart,
  addToCart,
  getStockBadgeInfo,
  formatETB,
  isSupabaseMode,
} from '../../../lib/koraRepository';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params?.id;
  const supabaseActive = isSupabaseMode();

  const [product, setProduct] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [inCartQty, setInCartQty] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState(null);

  const syncCartForProduct = useCallback((targetProduct) => {
    const cart = getCart();
    const cartItem = targetProduct
      ? cart.find((i) => i.productId === targetProduct.id)
      : null;
    const currentInCart = cartItem ? cartItem.quantity : 0;
    setInCartQty(currentInCart);
    if (targetProduct) {
      const remaining = Math.max(0, targetProduct.stock - currentInCart);
      setQuantity((prev) =>
        remaining <= 0 ? 1 : Math.min(Math.max(1, prev), remaining)
      );
    }
  }, []);

  const loadProduct = useCallback(async () => {
    setLoaded(false);
    setLoadError('');
    const res = await fetchProductByIdAsync(productId);
    if (!res.ok) {
      setProduct(null);
      if (!res.notFound) {
        setLoadError(res.error || 'Failed to load product from Supabase.');
      }
    } else {
      setProduct(res.product);
      syncCartForProduct(res.product);
    }
    setLoaded(true);
  }, [productId, syncCartForProduct]);

  useEffect(() => {
    loadProduct();

    const handleStoreUpdate = () => {
      const latest = getProductById(productId, { includeInactive: false });
      if (latest) {
        setProduct(latest);
        syncCartForProduct(latest);
      }
    };
    window.addEventListener('kora-store-updated', handleStoreUpdate);
    window.addEventListener('storage', handleStoreUpdate);
    return () => {
      window.removeEventListener('kora-store-updated', handleStoreUpdate);
      window.removeEventListener('storage', handleStoreUpdate);
    };
  }, [loadProduct, productId, syncCartForProduct]);

  if (!loaded) {
    return (
      <div className="card">
        <p>Loading product details...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card" style={{ padding: '36px 24px' }} role="alert">
        <h1 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>
          Unable to Load Product Detail
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '18px' }}>
          {loadError}
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={loadProduct}
            className="btn btn-primary btn-sm"
          >
            Retry
          </button>
          <Link href="/shop" className="btn btn-outline btn-sm">
            ← Return to Shop
          </Link>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>Product Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          This fictional coffee SKU does not exist or is currently inactive.
        </p>
        <Link href="/shop" className="btn btn-primary">
          ← Return to Shop
        </Link>
      </div>
    );
  }

  const stockBadge = getStockBadgeInfo(product.stock);
  const remainingAvailable = Math.max(0, product.stock - inCartQty);
  const isOutOfStock = product.stock <= 0;
  const isCappedInCart = !isOutOfStock && remainingAvailable <= 0;

  const handleQuantityChange = (nextVal) => {
    const parsed = parseInt(nextVal, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setQuantity(1);
      return;
    }
    if (parsed > remainingAvailable) {
      setQuantity(remainingAvailable);
      setFeedback({
        type: 'error',
        message: `Quantity capped at ${remainingAvailable}. Total stock is ${product.stock} unit(s)${
          inCartQty > 0 ? ` (${inCartQty} already in your cart)` : ''
        }.`,
      });
      return;
    }
    setFeedback(null);
    setQuantity(parsed);
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    const res = addToCart(product.id, quantity);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error });
    } else {
      setFeedback({
        type: 'success',
        message: `Added ${quantity} × ${product.name} to your cart.`,
      });
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '20px', fontSize: '0.875rem' }}>
        <Link href="/shop" style={{ textDecoration: 'underline', fontWeight: 600 }}>
          ← Back to Shop
        </Link>
        <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{product.name}</span>
      </div>

      <div className="two-col-layout">
        {/* Left Column: Product Package Illustration */}
        <div
          className="card"
          style={{
            backgroundColor: 'var(--surface-subtle)',
            textAlign: 'center',
            padding: '28px',
          }}
        >
          <img
            src={product.image}
            alt={`${product.name} concept bag`}
            style={{
              width: '100%',
              maxHeight: '420px',
              objectFit: 'contain',
            }}
          />
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginTop: '12px',
            }}
          >
            Illustrative packaging concept · Single-SKU model ({product.weight})
          </p>
        </div>

        {/* Right Column: Product Information & Add to Cart */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)',
              }}
            >
              Step 3 of 6 · Product Detail
            </span>
            <span className={`badge badge-${stockBadge.status}`}>
              {stockBadge.label}
            </span>
          </div>

          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
            {product.name}
          </h1>

          <div style={{ marginBottom: '18px' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800 }}>
              {formatETB(product.price)}
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginLeft: '8px',
              }}
            >
              Illustrative price · No online payment collected
            </span>
          </div>

          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
              marginBottom: '22px',
            }}
          >
            {product.description}
          </p>

          {/* Product Specifications Table */}
          <div
            style={{
              borderTop: '1px solid var(--border-neutral)',
              borderBottom: '1px solid var(--border-neutral)',
              padding: '14px 0',
              marginBottom: '22px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              fontSize: '0.88rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Roast Profile (Illustrative)
              </span>
              <strong>{product.roastProfile}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Net Weight
              </span>
              <strong>{product.weight} (Single SKU)</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Available Stock
              </span>
              <strong>
                {product.stock} {product.stock === 1 ? 'unit' : 'units'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                Currently in Your Cart
              </span>
              <strong>
                {inCartQty} {inCartQty === 1 ? 'unit' : 'units'}
              </strong>
            </div>
          </div>

          {/* Quantity & Add to Cart Controls */}
          <form onSubmit={handleAddToCart}>
            {isOutOfStock ? (
              <div className="alert-box" role="alert">
                <strong>Currently Out of Stock (0 units).</strong> Adding to cart is
                disabled until stock is replenished in{' '}
                {supabaseActive ? 'Admin Product Management' : 'Demo Admin Product Management'}.
              </div>
            ) : isCappedInCart ? (
              <div className="alert-box" role="status">
                <strong>Maximum available stock reached in cart.</strong> All{' '}
                {product.stock} available unit(s) of {product.name} are already in your
                cart.
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="qty-input">
                  Select Quantity (Max available to add: {remainingAvailable})
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-neutral btn-sm"
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    id="qty-input"
                    type="number"
                    min={1}
                    max={remainingAvailable}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="form-input"
                    style={{ width: '88px', textAlign: 'center', fontWeight: 700 }}
                  />
                  <button
                    type="button"
                    className="btn btn-neutral btn-sm"
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= remainingAvailable}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                {product.stock <= 5 && (
                  <span className="form-hint">
                    Low Stock Notice: Only {product.stock} unit(s) remaining in stock.
                  </span>
                )}
              </div>
            )}

            {feedback && (
              <div className="alert-box" role="status" style={{ marginTop: '12px' }}>
                {feedback.message}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '16px',
              }}
            >
              <button
                type="submit"
                disabled={isOutOfStock || isCappedInCart}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {isOutOfStock
                  ? 'Out of Stock — Cannot Add'
                  : isCappedInCart
                  ? 'Max Available in Cart'
                  : `Add ${quantity} to Cart · ${formatETB(product.price * quantity)}`}
              </button>

              <Link href="/cart" className="btn btn-outline">
                View Cart ({inCartQty}) →
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
