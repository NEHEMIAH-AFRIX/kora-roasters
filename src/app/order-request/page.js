'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getCartWithProducts,
  fetchActiveProductsAsync,
  submitOrderRequestAsync,
  formatETB,
  isSupabaseMode,
} from '../../lib/koraRepository';

export default function OrderRequestPage() {
  const router = useRouter();
  const supabaseActive = isSupabaseMode();

  const [cartData, setCartData] = useState({
    items: [],
    subtotal: 0,
    totalQuantity: 0,
    hasStockConflict: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state: Name + ONE contact method (email OR phone, never both mandatory) + optional note
  const [customerName, setCustomerName] = useState('');
  const [contactMethod, setContactMethod] = useState('email');
  const [contactValue, setContactValue] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (mounted) {
        setCartData(getCartWithProducts());
        setLoaded(true);
      }
    };
    fetchActiveProductsAsync().then(() => {
      sync();
    });
    sync();
    window.addEventListener('kora-store-updated', sync);
    return () => {
      mounted = false;
      window.removeEventListener('kora-store-updated', sync);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setErrors({});
    setSubmitting(true);

    try {
      const res = await submitOrderRequestAsync({
        customerName,
        contactMethod,
        contactValue,
        note,
      });

      if (!res.ok) {
        setErrors(
          res.errors || { form: 'Please check the form fields and try again.' }
        );
        return;
      }

      router.push(`/confirmation?ref=${encodeURIComponent(res.order.reference)}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="card">
        <p>Loading order request form...</p>
      </div>
    );
  }

  if (cartData.items.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
          No Items in Request Cart
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Please add at least one product to your cart before submitting an order
          request.
        </p>
        <Link href="/shop" className="btn btn-primary">
          Browse Shop →
        </Link>
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
        }}
      >
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
          Step 5 of 6 · Order Request Form
        </p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Submit an Order Request</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          No online payment is collected. Submitting this form creates a{' '}
          <strong>Pending</strong> order request (not yet a confirmed order) for review in
          the {supabaseActive ? 'Admin Orders Dashboard' : 'Demo Admin Dashboard'}.
        </p>
      </div>

      <div className="two-col-layout">
        {/* Form Card */}
        <form onSubmit={handleSubmit} className="card" noValidate>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>
            Customer Contact Details
          </h2>

          {errors.cart && (
            <div className="alert-box" role="alert">
              {errors.cart}{' '}
              <Link href="/cart" style={{ textDecoration: 'underline', fontWeight: 700 }}>
                Return to Cart
              </Link>
            </div>
          )}

          {errors.form && (
            <div
              className="alert-box"
              role="alert"
              style={{ borderColor: 'var(--kora-espresso)', borderWidth: '2px' }}
            >
              <strong>Order Request Blocked: </strong>
              <span>{errors.form}</span>
            </div>
          )}

          {/* Customer Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="customer-name">
              Your Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Demo Customer A"
              className="form-input"
              required
            />
            {errors.customerName && (
              <div className="form-error" role="alert">
                {errors.customerName}
              </div>
            )}
          </div>

          {/* Single Contact Method Selector (Email OR Phone — never both required) */}
          <div className="form-group">
            <span className="form-label">
              Preferred Contact Method (Choose One) <span aria-hidden="true">*</span>
            </span>
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '10px',
              }}
              role="radiogroup"
              aria-label="Preferred contact method"
            >
              <button
                type="button"
                onClick={() => {
                  setContactMethod('email');
                  setErrors((prev) => ({ ...prev, contactValue: undefined }));
                }}
                className={`btn btn-sm ${
                  contactMethod === 'email' ? 'btn-primary' : 'btn-neutral'
                }`}
                style={{ flex: 1 }}
                aria-pressed={contactMethod === 'email'}
              >
                Email Address
              </button>
              <button
                type="button"
                onClick={() => {
                  setContactMethod('phone');
                  setErrors((prev) => ({ ...prev, contactValue: undefined }));
                }}
                className={`btn btn-sm ${
                  contactMethod === 'phone' ? 'btn-primary' : 'btn-neutral'
                }`}
                style={{ flex: 1 }}
                aria-pressed={contactMethod === 'phone'}
              >
                Phone Number
              </button>
            </div>

            <label className="form-label" htmlFor="contact-value">
              {contactMethod === 'email' ? 'Email Address' : 'Phone Number'}{' '}
              <span aria-hidden="true">*</span>
            </label>
            <input
              id="contact-value"
              type={contactMethod === 'email' ? 'email' : 'tel'}
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={
                contactMethod === 'email'
                  ? 'demo.customer@example.com'
                  : '000-000-0100'
              }
              className="form-input"
              required
            />
            <span className="form-hint">
              Only one contact method ({contactMethod === 'email' ? 'email' : 'phone'}) is
              collected. For privacy, full contact details are hidden from the Admin
              Orders list and the printable confirmation summary.
            </span>
            {errors.contactValue && (
              <div className="form-error" role="alert">
                {errors.contactValue}
              </div>
            )}
          </div>

          {/* Optional Note */}
          <div className="form-group">
            <label className="form-label" htmlFor="order-note">
              Optional Note
            </label>
            <textarea
              id="order-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any optional notes for this order request..."
              className="form-textarea"
            />
          </div>

          {/* Clear Prototype Disclaimer */}
          <div className="alert-box" style={{ marginBottom: '18px' }}>
            <strong>Important Notice:</strong> Submitting this form creates a{' '}
            <strong>Pending</strong> request only—it is not yet a confirmed order, and no
            payment is taken. Product availability and totals are verified on submission,
            and stock is only deducted if an admin confirms the request.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="submit"
              disabled={cartData.hasStockConflict || submitting}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {submitting ? 'Submitting Request...' : 'Submit Order Request →'}
            </button>
            <Link href="/cart" className="btn btn-outline">
              ← Back to Cart
            </Link>
          </div>
        </form>

        {/* Right Column: Requested Items Review */}
        <div className="card">
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '14px' }}>
            Items in This Request ({cartData.totalQuantity})
          </h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {cartData.items.map((item) => (
              <div
                key={item.productId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-neutral)',
                  paddingBottom: '10px',
                  fontSize: '0.9rem',
                }}
              >
                <div>
                  <strong>
                    {item.quantity} × {item.product.name}
                  </strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {item.product.roastProfile} · {item.product.weight} (Available:{' '}
                    {item.maxAvailable})
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatETB(item.lineTotal)}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '1.1rem',
              fontWeight: 800,
              paddingTop: '6px',
            }}
          >
            <span>Illustrative Total</span>
            <span>{formatETB(cartData.subtotal)}</span>
          </div>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginTop: '6px',
            }}
          >
            {supabaseActive
              ? 'Authoritative prices and line totals are calculated from public.products in Supabase upon submission.'
              : 'Sample product details and ETB prices are illustrative for this portfolio concept.'}
          </p>
        </div>
      </div>
    </div>
  );
}
