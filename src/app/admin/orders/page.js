'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminNav from '../../../components/AdminNav';
import {
  getOrders,
  getProducts,
  ORDER_STATUSES,
  formatETB,
  isSupabaseMode,
} from '../../../lib/koraRepository';
import {
  fetchAdminOrdersListServerAction,
  fetchAdminProductsServerAction,
} from '../actions';

export default function AdminOrdersDashboardPage() {
  const supabaseActive = isSupabaseMode();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [loaded, setLoaded] = useState(false);
  const [unauthorizedError, setUnauthorizedError] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadDashboardData = useCallback(async () => {
    setLoaded(false);
    setUnauthorizedError('');
    setLoadError('');

    if (!supabaseActive) {
      setOrders(getOrders());
      setProducts(getProducts({ includeInactive: true }));
      setLoaded(true);
      return;
    }

    const [ordersRes, productsRes] = await Promise.all([
      fetchAdminOrdersListServerAction(),
      fetchAdminProductsServerAction(),
    ]);

    if (!ordersRes.ok) {
      if (ordersRes.unauthorized) {
        setUnauthorizedError(
          ordersRes.error || 'Authorized admin sign-in is required.'
        );
      } else {
        setLoadError(ordersRes.error || 'Failed to load orders from Supabase.');
      }
      setOrders([]);
      setLoaded(true);
      return;
    }

    if (!productsRes.ok) {
      setLoadError(
        productsRes.error || 'Failed to load product stock from Supabase.'
      );
    } else {
      setProducts(productsRes.products || []);
    }

    setOrders(ordersRes.orders || []);
    setLoaded(true);
  }, [supabaseActive]);

  useEffect(() => {
    loadDashboardData();

    const syncMock = () => {
      if (!supabaseActive) {
        setOrders(getOrders());
        setProducts(getProducts({ includeInactive: true }));
      }
    };
    window.addEventListener('kora-store-updated', syncMock);
    window.addEventListener('storage', syncMock);
    return () => {
      window.removeEventListener('kora-store-updated', syncMock);
      window.removeEventListener('storage', syncMock);
    };
  }, [loadDashboardData, supabaseActive]);

  const filteredOrders =
    statusFilter === 'All'
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  const hasStockShortage = (order) => {
    if (order.status !== 'Pending') return false;
    return order.items.some((item) => {
      const p = products.find((prod) => prod.id === item.productId);
      return !p || item.quantity > p.stock;
    });
  };

  const renderStockStatusCell = (order, shortage) => {
    if (order.status === 'Pending') {
      return shortage ? (
        <span className="badge badge-low admin-nowrap">
          ⚠ Insufficient Stock
        </span>
      ) : (
        <span className="admin-stock-note admin-nowrap">
          Stock Available (Not Deducted)
        </span>
      );
    }
    if (order.stockRestored) {
      return (
        <span className="admin-stock-note admin-nowrap">
          Stock Restored Once
        </span>
      );
    }
    if (order.stockDeducted) {
      return (
        <span className="admin-stock-deducted admin-nowrap">
          Stock Deducted Once
        </span>
      );
    }
    return (
      <span className="admin-stock-muted admin-nowrap">
        Stock Unchanged
      </span>
    );
  };

  if (loaded && unauthorizedError) {
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

  return (
    <div>
      <AdminNav />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: '4px',
            }}
          >
            Admin Screen 2 · Order Request Triage
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Orders Dashboard</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Review customer order requests and manage statuses. Full customer contact
            details are hidden in this overview list and shown only inside each request
            detail screen.
          </p>
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {['All', ...ORDER_STATUSES].map((st) => {
            const count =
              st === 'All'
                ? orders.length
                : orders.filter((o) => o.status === st).length;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`btn btn-sm admin-nowrap ${
                  statusFilter === st ? 'btn-primary' : 'btn-neutral'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <div
          className="alert-box"
          role="alert"
          style={{
            borderColor: 'var(--kora-espresso)',
            borderWidth: '2px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadDashboardData}
            className="btn btn-primary btn-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="card">
          <p>Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        /* EMPTY ORDERS LIST STATE */
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div className="badge badge-in" style={{ marginBottom: '12px' }}>
            Empty Orders List State
          </div>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>
            No Order Requests Match &ldquo;{statusFilter}&rdquo;
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              maxWidth: '460px',
              margin: '0 auto 20px',
              fontSize: '0.9rem',
            }}
          >
            {statusFilter === 'All'
              ? 'No customer order requests have been submitted yet.'
              : `There are currently 0 order requests with the "${statusFilter}" status.`}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {statusFilter !== 'All' && (
              <button
                type="button"
                onClick={() => setStatusFilter('All')}
                className="btn btn-primary btn-sm"
              >
                Show All Requests ({orders.length})
              </button>
            )}
            <Link href="/shop" className="btn btn-outline btn-sm">
              Create Request from Customer Shop →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW (> 960px) — Keeps IDs, names, status labels, and actions readable without awkward wrapping */}
          <div className="card admin-orders-desktop-view">
            <div className="table-wrap">
              <table className="data-table admin-orders-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Submitted</th>
                    <th>Customer &amp; Privacy</th>
                    <th>Requested Items</th>
                    <th>Illustrative Total</th>
                    <th>Stock Check</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const shortage = hasStockShortage(order);
                    return (
                      <tr key={order.id}>
                        <td className="admin-ref-cell">
                          <span className="admin-ref-code">{order.reference}</span>
                        </td>
                        <td className="admin-date-cell">
                          {new Date(order.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="admin-customer-cell">
                          <strong className="admin-customer-name">
                            {order.customerName}
                          </strong>
                          <div className="admin-privacy-label">
                            Contact details available in request.
                          </div>
                        </td>
                        <td className="admin-items-cell">
                          {order.items.map((i) => (
                            <div key={i.productId} className="admin-item-line">
                              {i.quantity} × {i.name}
                            </div>
                          ))}
                        </td>
                        <td className="admin-total-cell">
                          {formatETB(order.totalAmount)}
                        </td>
                        <td>{renderStockStatusCell(order, shortage)}</td>
                        <td>
                          <span className={`status-badge status-${order.status} admin-nowrap`}>
                            {order.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="btn btn-primary btn-sm admin-review-btn"
                          >
                            Review Request →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* NARROW SCREEN / MOBILE RESPONSIVE CARD LAYOUT (<= 960px) */}
          <div className="admin-orders-mobile-view">
            {filteredOrders.map((order) => {
              const shortage = hasStockShortage(order);
              return (
                <article key={order.id} className="card admin-order-card">
                  <div className="admin-order-card-top">
                    <div>
                      <span className="admin-order-card-eyebrow">Reference</span>
                      <span className="admin-ref-code">{order.reference}</span>
                    </div>
                    <span className={`status-badge status-${order.status} admin-nowrap`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="admin-order-card-body">
                    <div className="admin-order-card-row">
                      <span className="admin-order-card-label">Customer</span>
                      <div style={{ textAlign: 'right' }}>
                        <strong className="admin-customer-name">
                          {order.customerName}
                        </strong>
                        <div className="admin-privacy-label">
                          Contact details available in request.
                        </div>
                      </div>
                    </div>

                    <div className="admin-order-card-row">
                      <span className="admin-order-card-label">Submitted</span>
                      <span className="admin-date-cell">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="admin-order-card-row">
                      <span className="admin-order-card-label">Requested Items</span>
                      <div style={{ textAlign: 'right' }}>
                        {order.items.map((i) => (
                          <div key={i.productId} className="admin-item-line">
                            {i.quantity} × {i.name}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="admin-order-card-row">
                      <span className="admin-order-card-label">Stock Check</span>
                      <div>{renderStockStatusCell(order, shortage)}</div>
                    </div>

                    <div className="admin-order-card-row">
                      <span className="admin-order-card-label">Illustrative Total</span>
                      <strong className="admin-total-cell">
                        {formatETB(order.totalAmount)}
                      </strong>
                    </div>
                  </div>

                  <div className="admin-order-card-footer">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="btn btn-primary btn-sm admin-review-btn"
                      style={{ width: '100%' }}
                    >
                      Review Request →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
