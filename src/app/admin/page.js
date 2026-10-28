'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import KoraLogo from '../../components/KoraLogo';
import {
  getAdminSession,
  signInAdminDemo,
  signOutAdminDemo,
  isSupabaseMode,
} from '../../lib/koraRepository';
import { createKoraBrowserClient } from '../../lib/supabase/client';
import { checkServerAdminSessionAction } from './actions';

export default function AdminSignInPage() {
  const router = useRouter();
  const supabaseActive = isSupabaseMode();

  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Supabase Auth fields (existing admin user only; no public sign-up)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Mock Mode fields
  const [reviewerLabel, setReviewerLabel] = useState('Demo Reviewer');
  const [accessCode, setAccessCode] = useState('KORA-DEMO');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      setCheckingSession(true);
      if (supabaseActive) {
        const res = await checkServerAdminSessionAction();
        if (mounted) {
          setSession(res.authorized ? res.user : null);
          setCheckingSession(false);
        }
      } else if (mounted) {
        setSession(getAdminSession());
        setCheckingSession(false);
      }
    };
    check();
    return () => {
      mounted = false;
    };
  }, [supabaseActive]);

  const handleSupabaseSignIn = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both your admin email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createKoraBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message || 'Invalid admin credentials.');
        return;
      }

      // Verify on the server that the signed-in user is in public.kora_admins
      const adminCheck = await checkServerAdminSessionAction();
      if (!adminCheck.authorized) {
        await supabase.auth.signOut();
        setError(
          adminCheck.error ||
            'Access denied: this account is not authorized in public.kora_admins.'
        );
        return;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kora-store-updated'));
      }
      setSession(adminCheck.user);
      router.push('/admin/orders');
      router.refresh();
    } catch (err) {
      setError(err?.message || 'Unable to sign in with Supabase Auth.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMockSignIn = (e) => {
    e.preventDefault();
    setError('');
    if (!reviewerLabel.trim()) {
      setError('Please enter a display label for the demo admin session.');
      return;
    }
    if (!accessCode.trim()) {
      setError('Please enter any non-empty demo access code (pre-filled as KORA-DEMO).');
      return;
    }
    signInAdminDemo({ label: reviewerLabel });
    router.push('/admin/orders');
  };

  const handleSignOut = async () => {
    if (supabaseActive) {
      try {
        const supabase = createKoraBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // Ignore signOut transport errors
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kora-store-updated'));
      }
      setSession(null);
      router.refresh();
      return;
    }
    signOutAdminDemo();
    setSession(null);
  };

  return (
    <div style={{ maxWidth: '540px', margin: '12px auto' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '20px',
            background: 'transparent',
          }}
        >
          <KoraLogo variant="stacked" width={200} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span className="demo-tag" style={{ marginRight: 0, marginBottom: '8px' }}>
            {supabaseActive
              ? 'Supabase Auth · Protected by public.is_kora_admin()'
              : 'Demo-Only Admin Gate · No External Credentials Required'}
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '6px' }}>
            {supabaseActive ? 'Admin Sign-In' : 'Admin Prototype Sign-In'}
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {supabaseActive
              ? 'Sign in with your existing KORA admin account registered in Supabase Auth and public.kora_admins. Public sign-up is disabled.'
              : 'This gate is for portfolio workflow demonstration only. It does not provide real authentication or production security.'}
          </p>
        </div>

        <div className="alert-box" style={{ fontSize: '0.84rem' }}>
          {supabaseActive ? (
            <>
              <strong>Supabase Mode Active:</strong> Every admin screen and action is
              verified against your server-side Supabase Auth session and{' '}
              <code>public.is_kora_admin()</code> with Row-Level Security.
            </>
          ) : (
            <>
              <strong>Mock Mode Active:</strong> Customer order requests and product stock
              updates are stored locally in your browser. Set{' '}
              <code>NEXT_PUBLIC_KORA_DATA_MODE=supabase</code> in <code>.env.local</code>{' '}
              to switch to Supabase mode.
            </>
          )}
        </div>

        {checkingSession ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            Verifying admin session...
          </p>
        ) : session ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: '16px', fontWeight: 600 }}>
              {supabaseActive ? (
                <>
                  Signed in as <strong>Authorized KORA Admin</strong>.
                </>
              ) : (
                <>
                  Demo session is currently active as <strong>{session.label}</strong>.
                </>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href="/admin/orders" className="btn btn-primary">
                Open Orders Dashboard →
              </Link>
              <Link href="/admin/products" className="btn btn-outline">
                Open Product Management →
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="btn btn-neutral btn-sm"
              >
                {supabaseActive ? 'Sign Out of Admin Account' : 'Sign Out of Demo Session'}
              </button>
            </div>
          </div>
        ) : supabaseActive ? (
          <form onSubmit={handleSupabaseSignIn} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-email">
                Admin Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="admin@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-password">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                placeholder="••••••••••••"
                required
              />
              <span className="form-hint">
                Only existing accounts listed in <code>public.kora_admins</code> may
                access admin data or actions.
              </span>
            </div>

            {error && (
              <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {submitting ? 'Signing In & Verifying Admin Role...' : 'Sign In to Admin →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMockSignIn} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="reviewer-label">
                Demo Reviewer Label
              </label>
              <input
                id="reviewer-label"
                type="text"
                value={reviewerLabel}
                onChange={(e) => setReviewerLabel(e.target.value)}
                className="form-input"
                placeholder="Demo Reviewer"
              />
              <span className="form-hint">
                Pre-filled for one-click access. Clear this field to test invalid sign-in
                validation.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="demo-passcode">
                Demo Access Passcode (Simulated)
              </label>
              <input
                id="demo-passcode"
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="form-input"
              />
            </div>

            {error && (
              <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Enter Demo Admin Dashboard →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
