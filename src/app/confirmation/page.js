'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import KoraLogo from '../../components/KoraLogo';
import {
  getOrderByIdOrRef,
  getOrders,
  getConfirmationSummarySession,
  formatETB,
  isSupabaseMode,
} from '../../lib/koraRepository';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const refParam = searchParams.get('ref');
  const supabaseActive = isSupabaseMode();
  const [order, setOrder] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (refParam) {
        setOrder(getOrderByIdOrRef(refParam));
      } else if (supabaseActive) {
        setOrder(getConfirmationSummarySession());
      } else {
        const all = getOrders();
        setOrder(all.length > 0 ? all[0] : null);
      }
      setLoaded(true);
    };
    sync();
    window.addEventListener('kora-store-updated', sync);
    return () => window.removeEventListener('kora-store-updated', sync);
  }, [refParam, supabaseActive]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleDownloadText = () => {
    if (!order || typeof window === 'undefined') return;
    const lines = [
      'KORA ROASTERS — V1 PORTFOLIO CONCEPT PROTOTYPE',
      'ORDER REQUEST SUMMARY (NOT A CONFIRMED ORDER)',
      '================================================',
      `Request Reference : ${order.reference}`,
      `Status            : ${order.status} (Awaiting Review — Not Confirmed)`,
      `Submitted Date    : ${new Date(order.createdAt).toLocaleString()}`,
      `Customer Name     : ${order.customerName}`,
      `Contact Privacy   : Full contact details omitted from printable summary`,
      '------------------------------------------------',
      'REQUESTED ITEMS (ILLUSTRATIVE PRICING):',
      ...order.items.map(
        (item) =>
          `- ${item.quantity} x ${item.name} (${item.roastProfile}, ${
            item.weight
          }) @ ${formatETB(item.price)} = ${formatETB(item.price * item.quantity)}`
      ),
      '------------------------------------------------',
      `Illustrative Total: ${formatETB(order.totalAmount)}`,
      '',
      'NOTICE: This is a fictional portfolio demo. No payment has been taken, and this request is Pending review.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.reference}-summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loaded) {
    return (
      <div className="card">
        <p>Loading confirmation summary...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>
          Order Request Reference Not Found
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          We could not find an order request matching that reference in local demo
          storage.
        </p>
        <Link href="/shop" className="btn btn-primary">
          Browse Shop →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div className="card" style={{ padding: '32px' }}>
        {/* Printable Header with Transparent KORA Logo */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            paddingBottom: '20px',
            borderBottom: '2px solid var(--kora-espresso)',
            marginBottom: '24px',
          }}
        >
          <KoraLogo variant="horizontal" width={165} />
          <div style={{ textAlign: 'right' }}>
            <span className={`status-badge status-${order.status}`}>
              Status: {order.status}
            </span>
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                marginTop: '4px',
              }}
            >
              Step 6 of 6 · Printable Request Summary
            </div>
          </div>
        </div>

        {/* Explicit Pending & Portfolio Demo Explanation */}
        <div className="alert-box" role="status">
          <strong style={{ display: 'block', marginBottom: '4px' }}>
            Request Received — Status Is PENDING (Not Yet a Confirmed Order)
          </strong>
          <span>
            This request has <strong>not</strong> been confirmed and{' '}
            <strong>no payment has been taken</strong>. KORA Roasters is a fictional
            portfolio prototype; your request is saved in local browser mock storage so
            you can review and update its status in the Demo Admin Dashboard.
          </span>
        </div>

        {/* Core Reference & Metadata (Full contact details intentionally omitted for privacy) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '16px',
            backgroundColor: 'var(--surface-subtle)',
            padding: '18px',
            borderRadius: '6px',
            marginBottom: '24px',
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
              Unique Request Reference
            </span>
            <strong
              style={{
                fontSize: '1.35rem',
                fontFamily: 'monospace',
                letterSpacing: '0.04em',
              }}
            >
              {order.reference}
            </strong>
          </div>

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
              Submitted Date
            </span>
            <strong style={{ fontSize: '0.95rem' }}>
              {new Date(order.createdAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </strong>
          </div>

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
              Requested By
            </span>
            <strong style={{ fontSize: '0.95rem' }}>{order.customerName}</strong>
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
              }}
            >
              Full {order.contactMethod} details hidden on printable summary
            </span>
          </div>
        </div>

        {/* Requested Items Table */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px' }}>
          Requested Items &amp; Quantities
        </h2>

        <div className="table-wrap" style={{ marginBottom: '20px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Profile &amp; Weight</th>
                <th>Qty</th>
                <th style={{ textAlign: 'right' }}>Illustrative Price</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.productId}>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>
                    {item.roastProfile} · {item.weight}
                  </td>
                  <td>
                    <strong>{item.quantity}</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatETB(item.price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
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
            paddingTop: '12px',
            borderTop: '2px solid var(--kora-espresso)',
            marginBottom: '24px',
          }}
        >
          <div>
            <strong style={{ fontSize: '1.05rem' }}>
              Illustrative Total (No Payment Taken)
            </strong>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Sample prices and product details are illustrative for portfolio use.
            </div>
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>
            {formatETB(order.totalAmount)}
          </span>
        </div>

        {/* Actions (Hidden when printing) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-neutral)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button type="button" onClick={handlePrint} className="btn btn-primary">
              Print / Save Summary (PDF)
            </button>
            <button
              type="button"
              onClick={handleDownloadText}
              className="btn btn-outline"
            >
              Download Summary (.txt)
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <Link
              href={`/admin/orders/${order.id}`}
              className="btn btn-neutral btn-sm"
            >
              Review in Demo Admin →
            </Link>
            <Link href="/shop" className="btn btn-outline btn-sm">
              Back to Shop
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <p>Loading confirmation page...</p>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
