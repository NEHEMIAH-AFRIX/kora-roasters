'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminNav from '../../../../components/AdminNav';
import {
  getOrderByIdOrRef,
  getProducts,
  updateOrderStatus,
  fetchActiveProductsAsync,
  formatETB,
  isSupabaseMode,
} from '../../../../lib/koraRepository';
import {
  fetchAdminOrderDetailServerAction,
  fetchAdminProductsServerAction,
  transitionAdminOrderStatusServerAction,
} from '../../actions';

export default function AdminOrderReviewPage() {
  const params = useParams();
  const orderId = params?.id;
  const supabaseActive = isSupabaseMode();

  const [order, setOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [unauthorizedError, setUnauthorizedError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busyRef = useRef(false);

  const loadOrderDetail = useCallback(async () => {
    setLoaded(false);
    setUnauthorizedError('');
    setLoadError('');

    if (!supabaseActive) {
      setOrder(getOrderByIdOrRef(orderId));
      setProducts(getProducts({ includeInactive: true }));
      setLoaded(true);
      return;
    }

    const [orderRes, productsRes] = await Promise.all([
      fetchAdminOrderDetailServerAction(orderId),
      fetchAdminProductsServerAction(),
    ]);

    if (!orderRes.ok) {
      if (orderRes.unauthorized) {
        setUnauthorizedError(
          orderRes.error || 'Authorized admin sign-in is required.'
        );
      } else if (!orderRes.notFound) {
        setLoadError(orderRes.error || 'Failed to load order from Supabase.');
      }
      setOrder(null);
      setLoaded(true);
      return;
    }

    if (productsRes.ok) {
      setProducts(productsRes.products || []);
    }

    setOrder(orderRes.order);
    setLoaded(true);
  }, [orderId, supabaseActive]);

  useEffect(() => {
    loadOrderDetail();

    const syncMock = () => {
      if (!supabaseActive) {
        setOrder(getOrderByIdOrRef(orderId));
        setProducts(getProducts({ includeInactive: true }));
      }
    };
    window.addEventListener('kora-store-updated', syncMock);
    window.addEventListener('storage', syncMock);
    return () => {
      window.removeEventListener('kora-store-updated', syncMock);
      window.removeEventListener('storage', syncMock);
    };
  }, [loadOrderDetail, orderId, supabaseActive]);

  const handleStatusChange = async (nextStatus) => {
    if (!order || busyRef.current) return;
    busyRef.current = true;
    setIsSubmitting(true);

    try {
      if (supabaseActive) {
        const res = await transitionAdminOrderStatusServerAction(
          order.id,
          nextStatus
        );
        if (!res.ok) {
          setFeedback({
            type: 'error',
            title: 'Status Change Blocked',
            message: res.error,
          });
          return;
        }

        // Refresh products & active catalog cache so Shop stock labels update immediately
        const [productsRes] = await Promise.all([
          fetchAdminProductsServerAction(),
          fetchActiveProductsAsync(),
        ]);
        if (productsRes.ok) {
          setProducts(productsRes.products || []);
        }
        if (res.order) {
          setOrder(res.order);
        }
        setFeedback({
          type: 'success',
          title: `Status Updated to ${res.order?.status || nextStatus}`,
          message: res.message,
        });
        return;
      }

      // Mock mode execution
      const res = updateOrderStatus(order.id, nextStatus);
      if (!res.ok) {
        setFeedback({
          type: 'error',
          title: 'Status Change Blocked',
          message: res.error,
        });
      } else {
        setOrder(res.order);
        setProducts(getProducts({ includeInactive: true }));
        setFeedback({
          type: 'success',
          title: `Status Updated to ${res.order.status}`,
          message: res.message,
        });
      }
    } finally {
      busyRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div>
        <AdminNav />
        <div className="card">
          <p>Loading order review screen...</p>
        </div>
      </div>
    );
  }

  if (unauthorizedError) {
    return (
      <div>
        <AdminNav />
        <div
          className="card"
          style={{ textAlign: 'center', padding: '48px 24px' }}
          role="alert"
        >
          <span className="badge badge-low" style={{ marginBottom: '12px' }}>
            Protected Admin Route · public.is_kora_admin()
          </span>
          <h1 style={{ fontSize: '1.45rem', marginBottom: '8px' }}>
            Admin Authorization Required
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              maxWidth: '460px',
              margin: '0 auto 20px',
              fontSize: '0.9rem',
            }}
          >
            {unauthorizedError}
          </p>
          <Link href="/admin" className="btn btn-primary">
            Go to Admin Sign-In →
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <AdminNav />
        <div className="card" style={{ padding: '36px 24px' }} role="alert">
          <h1 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>
            Unable to Load Order Request
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '18px' }}>
            {loadError}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={loadOrderDetail}
              className="btn btn-primary btn-sm"
            >
              Retry
            </button>
            <Link href="/admin/orders" className="btn btn-outline btn-sm">
              ← Back to Orders Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <AdminNav />
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
            Order Request Not Found
          </h1>
          <Link href="/admin/orders" className="btn btn-primary">
            ← Back to Orders Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Evaluate live stock vs requested quantities
  const lineEvaluations = order.items.map((item) => {
    const liveProduct = products.find((p) => p.id === item.productId);
    const liveStock = liveProduct ? liveProduct.stock : 0;
    const isShort = order.status === 'Pending' && item.quantity > liveStock;
    return {
      ...item,
      liveStock,
      isShort,
    };
  });

  const anyShortageForConfirm = lineEvaluations.some((l) => l.isShort);

  return (
    <div>
      <AdminNav />

      <div style={{ marginBottom: '18px', fontSize: '0.875rem' }}>
        <Link
          href="/admin/orders"
          style={{ textDecoration: 'underline', fontWeight: 600 }}
        >
          ← Back to Orders Dashboard
        </Link>
        <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>/</span>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Review Request {order.reference}
        </span>
      </div>

      {feedback && (
        <div
          className="alert-box"
          role="alert"
          aria-live="assertive"
          style={{
            borderColor: 'var(--kora-espresso)',
            borderWidth: '2px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div>
            <strong style={{ display: 'block', marginBottom: '2px' }}>
              {feedback.title}
            </strong>
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="btn btn-neutral btn-sm"
            style={{ flexShrink: 0 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="admin-grid">
        {/* Left Column: Request Details & Line Items vs Stock */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-neutral)',
              marginBottom: '20px',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  display: 'block',
                }}
              >
                Order Request Reference
              </span>
              <h1
                style={{
                  fontSize: '1.65rem',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {order.reference}
              </h1>
            </div>

            <span className={`status-badge status-${order.status} admin-nowrap`}>
              Status: {order.status}
            </span>
          </div>

          {/* Customer Contact Metadata (Restricted to Individual Request Detail Screen Only) */}
          <div
            style={{
              backgroundColor: 'var(--surface-subtle)',
              padding: '16px',
              borderRadius: '6px',
              marginBottom: '22px',
              border: '1px solid var(--border-neutral)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-hairline)',
              }}
            >
              <span
                style={{
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                }}
              >
                Customer Contact Record (Detail View Only)
              </span>
              <span
                style={{
                  fontSize: '0.73rem',
                  color: 'var(--text-muted)',
                }}
              >
                Hidden in Orders Dashboard list &amp; printable summary
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                fontSize: '0.88rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Customer Name
                </span>
                <strong className="admin-customer-name">{order.customerName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Submitted Contact ({order.contactMethod})
                </span>
                <strong style={{ wordBreak: 'break-all' }}>{order.contactValue}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Submitted Date
                </span>
                <strong className="admin-nowrap">
                  {new Date(order.createdAt).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </strong>
              </div>
            </div>
          </div>

          {order.note && (
            <div style={{ marginBottom: '22px', fontSize: '0.88rem' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>
                Customer Note:
              </strong>
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--surface-subtle)',
                  borderRadius: '5px',
                  color: 'var(--text-secondary)',
                }}
              >
                {order.note}
              </div>
            </div>
          )}

          {/* Requested Items vs Live Stock Table */}
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>
            Requested Items &amp; Live Stock Verification
          </h2>

          <div className="table-wrap" style={{ marginBottom: '18px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Requested Qty</th>
                  <th>Current SKU Stock</th>
                  <th>Stock Check</th>
                  <th style={{ textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lineEvaluations.map((item) => (
                  <tr key={item.productId}>
                    <td>
                      <strong className="admin-nowrap">{item.name}</strong>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {item.roastProfile} · {item.weight}
                      </div>
                    </td>
                    <td className="admin-nowrap">
                      <strong>{item.quantity}</strong> unit(s)
                    </td>
                    <td className="admin-nowrap">
                      <strong>{item.liveStock}</strong> unit(s)
                    </td>
                    <td>
                      {order.status === 'Pending' ? (
                        item.isShort ? (
                          <span className="badge badge-low admin-nowrap">
                            ⚠ Short by {item.quantity - item.liveStock} unit(s)
                          </span>
                        ) : (
                          <span className="badge badge-in admin-nowrap">
                            Sufficient Stock
                          </span>
                        )
                      ) : order.stockRestored ? (
                        <span className="admin-nowrap" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Restored Once (+{item.quantity})
                        </span>
                      ) : order.stockDeducted ? (
                        <span className="admin-nowrap" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          Deducted Once (-{item.quantity})
                        </span>
                      ) : (
                        <span className="admin-nowrap" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Not Deducted
                        </span>
                      )}
                    </td>
                    <td className="admin-nowrap" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatETB(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '10px',
              borderTop: '2px solid var(--kora-espresso)',
              fontWeight: 800,
              fontSize: '1.1rem',
            }}
          >
            <span>Illustrative Order Total</span>
            <span className="admin-nowrap">{formatETB(order.totalAmount)}</span>
          </div>
        </div>

        {/* Right Column: Status Actions & Stock Lifecycle Audit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '10px' }}>
              Update Order Status
            </h2>
            <p
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                marginBottom: '16px',
              }}
            >
              Current Status: <strong>{order.status}</strong> ·{' '}
              <span>
                {order.stockRestored
                  ? 'Stock restored once'
                  : order.stockDeducted
                  ? 'Stock deducted once'
                  : 'Stock not deducted'}
              </span>
            </p>

            {/* PENDING ACTIONS */}
            {order.status === 'Pending' && (
              <div>
                {anyShortageForConfirm && (
                  <div className="alert-box" style={{ fontSize: '0.83rem' }}>
                    <strong>Insufficient Stock Warning:</strong> One or more requested
                    products do not have enough stock to fulfill this request. Clicking{' '}
                    <em>Confirm Request</em> will reject the entire confirmation without
                    partially deducting stock and explain which item needs attention, or
                    you can restock in{' '}
                    <Link
                      href="/admin/products"
                      style={{ textDecoration: 'underline', fontWeight: 700 }}
                    >
                      Product Management
                    </Link>
                    .
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleStatusChange('Confirmed')}
                    className="btn btn-primary"
                  >
                    {isSubmitting
                      ? 'Updating...'
                      : 'Confirm Request (Check All Items & Deduct Stock Once)'}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleStatusChange('Declined')}
                    className="btn btn-outline"
                  >
                    Decline Request (Leave Stock Unchanged)
                  </button>
                </div>
              </div>
            )}

            {/* CONFIRMED ACTIONS */}
            {order.status === 'Confirmed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Stock was deducted once when this request was confirmed. Completing
                  leaves stock unchanged; cancelling restores its stock exactly once.
                </p>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange('Completed')}
                  className="btn btn-primary"
                >
                  {isSubmitting
                    ? 'Updating...'
                    : 'Mark as Completed (Leave Stock Unchanged)'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange('Cancelled')}
                  className="btn btn-outline"
                >
                  Cancel Confirmed Order (Restore Stock Once)
                </button>
              </div>
            )}

            {/* TERMINAL STATES (Completed, Declined, Cancelled) */}
            {['Completed', 'Declined', 'Cancelled'].includes(order.status) && (
              <div>
                <div className="alert-box" style={{ marginBottom: '12px' }}>
                  <strong>Terminal Status ({order.status}):</strong>
                  <p style={{ marginTop: '4px', fontSize: '0.84rem' }}>
                    {order.status === 'Cancelled'
                      ? 'This confirmed order was cancelled and its stock has already been restored once. Repeated cancellation or status updates are blocked from altering stock again.'
                      : order.status === 'Declined'
                      ? 'This pending request was declined. Stock was left unchanged.'
                      : 'This order is marked Completed. Stock deducted at confirmation remains finalized.'}
                  </p>
                </div>

                {/* Duplicate-Action Guard Verification Button */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange(order.status)}
                  className="btn btn-neutral btn-sm"
                  style={{ width: '100%' }}
                >
                  Verify Duplicate &ldquo;{order.status}&rdquo; Protection
                </button>
              </div>
            )}
          </div>

          {/* Audit History Card */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
              Status &amp; Stock Audit Trail
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(order.history || []).map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    borderLeft: '2.5px solid var(--kora-espresso)',
                    paddingLeft: '12px',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {entry.status} ·{' '}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                      {new Date(entry.timestamp).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {entry.note}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
