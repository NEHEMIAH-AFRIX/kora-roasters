'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getCartWithProducts,
  fetchActiveProductsAsync,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getStockBadgeInfo,
  formatETB,
} from '../../lib/koraRepository';

export default function CartPage() {
  const [cartData, setCartData] = useState({
    items: [],
    subtotal: 0,
    totalQuantity: 0,
    hasStockConflict: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (mounted) {
        setCartData(getCartWithProducts());
        setLoaded(true);
      }
    };
    fetchActiveProductsAsync().then((res) => {
      if (mounted && !res.ok) {
        setErrorMsg(res.error || 'Could not verify latest product inventory.');
      }
      sync();
    });
    sync();
    window.addEventListener('kora-store-updated', sync);
    return () => {
      mounted = false;
      window.removeEventListener('kora-store-updated', sync);
    };
  }, []);

  const handleQtyUpdate = (item, nextQty) => {
    setErrorMsg('');
    if (nextQty <= 0) {
      removeFromCart(item.productId);
      return;
    }
    if (nextQty > item.maxAvailable) {
      setErrorMsg(
        `Cannot exceed available stock for ${item.product.name} (${item.maxAvailable} unit(s) available).`
      );
      return;
    }
    const res = updateCartQuantity(item.productId, nextQty);
    if (!res.ok) {
      setErrorMsg(res.error);
    }
  };

  const handleRemove = (productId) => {
    setErrorMsg('');
    removeFromCart(productId);
  };

  if (!loaded) {
    return (
      <div className="card">
        <p>Loading cart...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          marginBottom: '28px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-neutral)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '12px',
        }}
      >
        <div>
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '4px',
            }}
          >
            Step 4 of 6 · Request Cart
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Your Request Cart</h1>
        </div>
        {cartData.items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearCart();
              setErrorMsg('');
            }}
            className="btn btn-neutral btn-sm"
          >
            Clear Cart
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="alert-box" role="alert">
          {errorMsg}
        </div>
      )}

      {/* EMPTY CART STATE */}
      {cartData.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div className="badge badge-in" style={{ marginBottom: '12px' }}>
            Empty Cart State
          </div>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>
            Your Request Cart Is Empty
          </h2>
          <p
            style={{
              maxWidth: '460px',
              margin: '0 auto 24px',
              color: 'var(--text-secondary)',
              fontSize: '0.92rem',
            }}
          >
            Browse the fictional KORA coffee releases to add items before submitting a
            Pending order request.
          </p>
          <Link href="/shop" className="btn btn-primary">
            Browse Shop →
          </Link>
        </div>
      ) : (
        <div className="two-col-layout">
          {/* Cart Line Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {cartData.items.map((item) => {
              const stockBadge = getStockBadgeInfo(item.product.stock);
              return (
                <div
                  key={item.productId}
                  className="card"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      style={{
                        width: '72px',
                        height: '80px',
                        objectFit: 'contain',
                        backgroundColor: 'var(--surface-subtle)',
                        borderRadius: '5px',
                        padding: '6px',
                      }}
                    />
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginBottom: '4px',
                        }}
                      >
                        <Link
                          href={`/shop/${item.productId}`}
                          style={{ fontWeight: 800, fontSize: '1.08rem' }}
                        >
                          {item.product.name}
                        </Link>
                        <span className={`badge badge-${stockBadge.status}`}>
                          {stockBadge.label}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {item.product.roastProfile} · {item.product.weight} ·{' '}
                        {formatETB(item.product.price)} each (Illustrative)
                      </p>
                      {item.exceedsStock && (
                        <p
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            marginTop: '6px',
                            color: 'var(--kora-espresso)',
                          }}
                        >
                          ⚠ Quantity ({item.quantity}) exceeds current stock (
                          {item.maxAvailable}). Please adjust quantity to continue.
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Quantity Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-neutral btn-sm"
                        onClick={() => handleQtyUpdate(item, item.quantity - 1)}
                        aria-label={`Decrease quantity of ${item.product.name}`}
                      >
                        −
                      </button>
                      <span
                        style={{
                          minWidth: '32px',
                          textAlign: 'center',
                          fontWeight: 700,
                        }}
                        aria-label={`Quantity: ${item.quantity}`}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="btn btn-neutral btn-sm"
                        onClick={() => handleQtyUpdate(item, item.quantity + 1)}
                        disabled={item.quantity >= item.maxAvailable}
                        aria-label={`Increase quantity of ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>

                    <div style={{ minWidth: '95px', textAlign: 'right', fontWeight: 800 }}>
                      {formatETB(item.lineTotal)}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.productId)}
                      className="btn btn-outline btn-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart Summary Box */}
          <div className="card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '14px' }}>
              Order Request Summary
            </h2>

            <div
              style={{
                borderTop: '1px solid var(--border-neutral)',
                borderBottom: '1px solid var(--border-neutral)',
                padding: '14px 0',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '0.92rem',
                }}
              >
                <span>Total Bags Requested</span>
                <strong>{cartData.totalQuantity}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                }}
              >
                <span>Illustrative Subtotal</span>
                <span>{formatETB(cartData.subtotal)}</span>
              </div>
            </div>

            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                marginBottom: '18px',
              }}
            >
              <strong>Prototype Notice:</strong> No online payment is collected. Next,
              you will enter your name and one contact method to submit a{' '}
              <strong>Pending</strong> order request.
            </p>

            {cartData.hasStockConflict && (
              <div className="form-error" style={{ marginBottom: '16px' }}>
                One or more items exceed available stock. Please reduce quantity or remove
                unavailable items before proceeding.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cartData.hasStockConflict ? (
                <button type="button" disabled className="btn btn-primary">
                  Resolve Stock Limit to Proceed
                </button>
              ) : (
                <Link href="/order-request" className="btn btn-primary">
                  Proceed to Order Request →
                </Link>
              )}
              <Link href="/shop" className="btn btn-outline">
                ← Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
