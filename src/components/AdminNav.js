'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  getAdminSession,
  signInAdminDemo,
  signOutAdminDemo,
  resetAllDemoData,
  isSupabaseMode,
} from '../lib/koraRepository';
import { createKoraBrowserClient } from '../lib/supabase/client';
import { checkServerAdminSessionAction } from '../app/admin/actions';

export default function AdminNav() {
  const pathname = usePathname() || '/admin';
  const router = useRouter();
  const supabaseActive = isSupabaseMode();

  const [session, setSession] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      if (supabaseActive) {
        const res = await checkServerAdminSessionAction();
        if (mounted) {
          setSession(res.authorized ? res.user : null);
        }
      } else if (mounted) {
        setSession(getAdminSession());
      }
    };
    sync();
    window.addEventListener('kora-store-updated', sync);
    return () => {
      mounted = false;
      window.removeEventListener('kora-store-updated', sync);
    };
  }, [pathname, supabaseActive]);

  const handleQuickActivate = () => {
    signInAdminDemo({ label: 'Demo Reviewer' });
    setSession(getAdminSession());
  };

  const handleSignOut = async () => {
    if (supabaseActive) {
      try {
        const supabase = createKoraBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // Proceed to sign-in screen
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kora-store-updated'));
      }
      router.push('/admin');
      router.refresh();
      return;
    }

    signOutAdminDemo();
    router.push('/admin');
  };

  const handleConfirmReset = () => {
    resetAllDemoData();
    setConfirmingReset(false);
    setResetMessage(
      'Reset complete: local mock orders and product changes were cleared and documented fictional seed data was restored.'
    );
    setTimeout(() => setResetMessage(''), 5500);
  };

  return (
    <div
      className="card no-print"
      style={{
        marginBottom: '24px',
        padding: '16px 20px',
        backgroundColor: 'var(--surface-subtle)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="demo-tag">
              {supabaseActive
                ? 'Supabase Admin · RLS & is_kora_admin()'
                : 'Demo-Only Admin Gate'}
            </span>
            <strong style={{ fontSize: '0.95rem' }}>
              KORA Roasters — {supabaseActive ? 'Admin Management' : 'Prototype Administration'}
            </strong>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            {supabaseActive
              ? 'Protected by server-side Supabase Auth session, Row-Level Security, and public.is_kora_admin().'
              : 'Mock data & browser localStorage only. Not production authentication or database persistence.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <Link
            href="/admin/orders"
            className={`btn btn-sm ${
              pathname.startsWith('/admin/orders') ? 'btn-primary' : 'btn-outline'
            }`}
          >
            Orders Dashboard
          </Link>
          <Link
            href="/admin/products"
            className={`btn btn-sm ${
              pathname.startsWith('/admin/products') ? 'btn-primary' : 'btn-outline'
            }`}
          >
            Product Management
          </Link>

          {!supabaseActive && (
            <button
              type="button"
              onClick={() => {
                setResetMessage('');
                setConfirmingReset((prev) => !prev);
              }}
              aria-expanded={confirmingReset}
              className="btn btn-neutral btn-sm"
            >
              Reset Demo Data
            </button>
          )}

          {session ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="btn btn-neutral btn-sm"
            >
              {supabaseActive
                ? 'Sign Out (Admin)'
                : `Exit Demo Session (${session.label})`}
            </button>
          ) : !supabaseActive ? (
            <button
              type="button"
              onClick={handleQuickActivate}
              className="btn btn-neutral btn-sm"
            >
              Activate Demo Session
            </button>
          ) : (
            <Link href="/admin" className="btn btn-neutral btn-sm">
              Admin Sign-In
            </Link>
          )}
        </div>
      </div>

      {/* Confirmation Notice Before Resetting Demo Data (Mock Mode) */}
      {!supabaseActive && confirmingReset && (
        <div
          role="alertdialog"
          aria-labelledby="admin-reset-title"
          aria-describedby="admin-reset-desc"
          style={{
            marginTop: '14px',
            padding: '14px 16px',
            backgroundColor: 'var(--surface-card)',
            border: '1.5px solid var(--kora-espresso)',
            borderRadius: '5px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '0.84rem' }}>
            <strong id="admin-reset-title" style={{ display: 'block', marginBottom: '2px' }}>
              Confirm Reset Demo Data?
            </strong>
            <span id="admin-reset-desc" style={{ color: 'var(--text-secondary)' }}>
              This deletes all local mock orders, cart items, and product/stock changes in this browser and restores the documented fictional seed state (KORA No. 01–03 and Demo Customer A–C).
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleConfirmReset}
              className="btn btn-primary btn-sm"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {resetMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: 'var(--surface-card)',
            borderLeft: '3px solid var(--kora-espresso)',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          {resetMessage}
        </div>
      )}
    </div>
  );
}
