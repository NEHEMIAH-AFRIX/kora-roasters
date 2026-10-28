'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import KoraLogo from './KoraLogo';
import {
  getCartWithProducts,
  getAdminSession,
  resetAllDemoData,
  getDataMode,
  isSupabaseMode,
  fetchActiveProductsAsync,
} from '../lib/koraRepository';
import { checkServerAdminSessionAction } from '../app/admin/actions';

export default function AppShell({ children }) {
  const pathname = usePathname() || '/';
  const dataMode = getDataMode();
  const supabaseActive = isSupabaseMode();

  const [cartCount, setCartCount] = useState(0);
  const [adminSession, setAdminSession] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetFeedback, setResetFeedback] = useState('');

  useEffect(() => {
    let mounted = true;

    const syncState = async () => {
      const cartData = getCartWithProducts();
      if (mounted) {
        setCartCount(cartData.totalQuantity);
      }

      if (supabaseActive) {
        const res = await checkServerAdminSessionAction();
        if (mounted) {
          setAdminSession(res.authorized ? res.user : null);
        }
      } else if (mounted) {
        setAdminSession(getAdminSession());
      }
    };

    const handleOpenResetPrompt = () => {
      if (!supabaseActive) {
        setShowResetConfirm(true);
      }
    };

    // Prime active products cache in Supabase mode so cart badge stays accurate
    if (supabaseActive) {
      fetchActiveProductsAsync().then(() => {
        if (mounted) {
          const cartData = getCartWithProducts();
          setCartCount(cartData.totalQuantity);
        }
      });
    }

    syncState();
    window.addEventListener('kora-store-updated', syncState);
    window.addEventListener('storage', syncState);
    window.addEventListener('kora-request-reset-demo', handleOpenResetPrompt);
    return () => {
      mounted = false;
      window.removeEventListener('kora-store-updated', syncState);
      window.removeEventListener('storage', syncState);
      window.removeEventListener('kora-request-reset-demo', handleOpenResetPrompt);
    };
  }, [pathname, supabaseActive]);

  const handleRequestReset = () => {
    setResetFeedback('');
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    resetAllDemoData();
    setShowResetConfirm(false);
    setResetFeedback(
      'Local mock orders and product changes deleted. Fictional seed data restored.'
    );
    setTimeout(() => setResetFeedback(''), 5000);
  };

  const handleCancelReset = () => {
    setShowResetConfirm(false);
  };

  const isAdminRoute = pathname.startsWith('/admin');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Extremely Subtle Printed-Paper Grain Overlay */}
      <div className="paper-grain-overlay no-print" aria-hidden="true" />

      {/* Slim Mode Disclosure Strip */}
      <div className="demo-banner no-print" role="region" aria-label="Application data mode notice">
        <div className="container demo-banner-inner">
          <div>
            <span className="demo-tag">
              {supabaseActive
                ? 'Portfolio Concept · Supabase Mode'
                : 'Portfolio Concept · Mock Mode'}
            </span>
            <span>
              {supabaseActive
                ? 'Connected to Supabase (RLS + atomic order & inventory RPCs). Illustrative products & ETB pricing—no online payment.'
                : 'Illustrative products, ETB pricing, and browser mock storage for demonstration only—no live checkout or real authentication.'}
            </span>
          </div>

          {!supabaseActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {resetFeedback && (
                <span
                  role="status"
                  aria-live="polite"
                  style={{ fontWeight: 700, fontSize: '0.74rem' }}
                >
                  {resetFeedback}
                </span>
              )}
              <button
                type="button"
                onClick={handleRequestReset}
                aria-expanded={showResetConfirm}
                className="demo-reset-btn"
              >
                Reset Demo Data
              </button>
            </div>
          )}
        </div>

        {/* Confirmation Dialog Before Clearing Local Mock Records (Mock Mode) */}
        {!supabaseActive && showResetConfirm && (
          <div
            role="alertdialog"
            aria-labelledby="reset-demo-dialog-title"
            aria-describedby="reset-demo-dialog-desc"
            className="demo-reset-confirm-bar"
          >
            <div className="container demo-reset-confirm-inner">
              <div>
                <strong id="reset-demo-dialog-title" style={{ display: 'block', marginBottom: '2px' }}>
                  Confirm Reset Demo Data?
                </strong>
                <span id="reset-demo-dialog-desc">
                  Resetting deletes all local mock orders, cart items, and product/stock changes in this browser and restores the documented fictional seed data (KORA No. 01–03 and Demo Customer A–C).
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="demo-reset-confirm-btn"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={handleCancelReset}
                  className="demo-reset-cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editorial Navigation Header (Preserves Transparent KORA Logo #2C211E) */}
      <header className="site-header no-print">
        <div className="container header-inner">
          <Link href="/" aria-label="KORA Roasters Home" className="brand-logo-link">
            <KoraLogo variant="horizontal" width={168} />
          </Link>

          <nav className="nav-links" aria-label="Primary navigation">
            <Link
              href="/"
              className={`nav-link ${pathname === '/' ? 'active' : ''}`}
            >
              Home
            </Link>
            <Link
              href="/shop"
              className={`nav-link ${pathname.startsWith('/shop') ? 'active' : ''}`}
            >
              Collection
            </Link>
            <Link
              href={adminSession ? '/admin/orders' : '/admin'}
              className={`nav-link ${isAdminRoute ? 'active' : ''}`}
            >
              {supabaseActive
                ? adminSession
                  ? 'Admin (Signed In)'
                  : 'Admin Sign-In'
                : adminSession
                ? 'Admin Demo (Active)'
                : 'Admin Demo'}
            </Link>
            <Link
              href="/cart"
              className={`cart-pill ${
                pathname === '/cart' || pathname === '/order-request' ? 'active' : ''
              }`}
            >
              <span>Cart</span>
              <span className="cart-count" aria-label={`${cartCount} items in cart`}>
                {cartCount}
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '14px 0 64px' }}>
        <div className="container">{children}</div>
      </main>

      {/* Restrained Editorial Footer */}
      <footer
        className="site-footer no-print"
        style={{
          borderTop: '1px solid var(--border-neutral)',
          padding: '28px 0',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div>
            <strong style={{ color: 'var(--kora-espresso)', letterSpacing: '0.02em' }}>
              KORA Roasters — V1 Concept ({dataMode.toUpperCase()} Mode)
            </strong>
            <p style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
              Fictional packaged-coffee portfolio concept. Illustrative product details and pricing only.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <Link href="/shop" className="footer-link">
              Customer Shop
            </Link>
            <Link href="/cart" className="footer-link">
              Request Cart
            </Link>
            <Link href="/admin" className="footer-link">
              {supabaseActive ? 'Admin Portal' : 'Demo Admin Gate'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
