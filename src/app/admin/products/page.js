'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminNav from '../../../components/AdminNav';
import {
  getProducts,
  saveProduct,
  updateProductStock,
  fetchActiveProductsAsync,
  getStockBadgeInfo,
  formatETB,
  isSupabaseMode,
} from '../../../lib/koraRepository';
import {
  fetchAdminProductsServerAction,
  saveAdminProductServerAction,
  updateAdminProductStockServerAction,
} from '../actions';

const EMPTY_FORM = {
  id: '',
  name: '',
  description: '',
  price: '',
  weight: '250g',
  roastProfile: 'Medium Roast',
  stock: '',
  image: '/images/kora-bag-default.svg',
  active: true,
};

export default function AdminProductsPage() {
  const supabaseActive = isSupabaseMode();
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [unauthorizedError, setUnauthorizedError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoaded(false);
    setUnauthorizedError('');
    setLoadError('');

    if (!supabaseActive) {
      setProducts(getProducts({ includeInactive: true }));
      setLoaded(true);
      return;
    }

    const res = await fetchAdminProductsServerAction();
    if (!res.ok) {
      if (res.unauthorized) {
        setUnauthorizedError(
          res.error || 'Authorized admin sign-in is required.'
        );
      } else {
        setLoadError(res.error || 'Failed to load products from Supabase.');
      }
      setProducts([]);
      setLoaded(true);
      return;
    }

    setProducts(res.products || []);
    setLoaded(true);
  }, [supabaseActive]);

  useEffect(() => {
    loadProducts();

    const syncMock = () => {
      if (!supabaseActive) {
        setProducts(getProducts({ includeInactive: true }));
      }
    };
    window.addEventListener('kora-store-updated', syncMock);
    return () => window.removeEventListener('kora-store-updated', syncMock);
  }, [loadProducts, supabaseActive]);

  const handleEditSelect = (product) => {
    setFormErrors({});
    setFeedback('');
    setFormData({
      id: product.id,
      name: product.name,
      description: product.description,
      price: String(product.price),
      weight: product.weight,
      roastProfile: product.roastProfile,
      stock: String(product.stock),
      image: product.image,
      active: Boolean(product.active),
    });
  };

  const handleResetForm = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  const handleQuickStockAdjust = async (product, delta) => {
    const nextStock = Math.max(0, product.stock + delta);
    setFeedback('');
    setLoadError('');

    if (supabaseActive) {
      const res = await updateAdminProductStockServerAction(product.id, nextStock);
      if (!res.ok) {
        setLoadError(res.error || 'Could not update stock in Supabase.');
        return;
      }
      await Promise.all([loadProducts(), fetchActiveProductsAsync()]);
      setFeedback(`Updated stock for ${product.name} to ${nextStock} unit(s) in Supabase.`);
      if (formData.id === product.id) {
        setFormData((prev) => ({ ...prev, stock: String(nextStock) }));
      }
      return;
    }

    const res = updateProductStock(product.id, nextStock);
    if (res.ok) {
      setProducts(getProducts({ includeInactive: true }));
      setFeedback(`Updated stock for ${product.name} to ${nextStock} unit(s).`);
      if (formData.id === product.id) {
        setFormData((prev) => ({ ...prev, stock: String(nextStock) }));
      }
    }
  };

  const handleToggleActive = async (product) => {
    setFeedback('');
    setLoadError('');

    if (supabaseActive) {
      const res = await saveAdminProductServerAction({
        ...product,
        active: !product.active,
        is_active: !product.active,
      });
      if (!res.ok) {
        setLoadError(
          res.errors?.form || res.error || 'Could not toggle product status in Supabase.'
        );
        return;
      }
      await Promise.all([loadProducts(), fetchActiveProductsAsync()]);
      setFeedback(
        `${product.name} marked as ${!product.active ? 'Active' : 'Inactive'} in Supabase.`
      );
      return;
    }

    const res = saveProduct({
      ...product,
      active: !product.active,
    });
    if (res.ok) {
      setProducts(getProducts({ includeInactive: true }));
      setFeedback(
        `${product.name} marked as ${!product.active ? 'Active' : 'Inactive'}.`
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormErrors({});
    setFeedback('');
    setLoadError('');

    const stockTrimmed = String(formData.stock).trim();
    const stockNumber =
      stockTrimmed === '' || !/^-?\d+$/.test(stockTrimmed)
        ? Number.NaN
        : parseInt(stockTrimmed, 10);

    const payload = {
      ...formData,
      price: formData.price === '' ? Number.NaN : Number(formData.price),
      stock: stockNumber,
    };

    if (supabaseActive) {
      setSubmitting(true);
      try {
        const res = await saveAdminProductServerAction(payload);
        if (!res.ok) {
          setFormErrors(res.errors || { form: res.error || 'Save failed.' });
          return;
        }
        await Promise.all([loadProducts(), fetchActiveProductsAsync()]);
        setFeedback(
          formData.id
            ? `Saved changes to ${res.product.name} in Supabase.`
            : `Added new single-SKU product: ${res.product.name} in Supabase.`
        );
        setFormData(EMPTY_FORM);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const res = saveProduct(payload);
    if (!res.ok) {
      setFormErrors(res.errors || {});
      return;
    }

    setProducts(getProducts({ includeInactive: true }));
    setFeedback(
      formData.id
        ? `Saved changes to ${res.product.name}.`
        : `Added new single-SKU product: ${res.product.name}.`
    );
    setFormData(EMPTY_FORM);
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

      <div style={{ marginBottom: '24px' }}>
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
          Admin Screen 3 · Catalog &amp; Stock Control
        </p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Product Management</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Add or edit single-SKU fictional coffee products (`price_etb`, `net_weight_g`,
          `roast_profile`, `stock_quantity`, `image_path`, `is_active`). Changes
          immediately sync to the customer Shop.
        </p>
      </div>

      {loadError && (
        <div className="alert-box" role="alert">
          <strong>Error: </strong>
          <span>{loadError}</span>
        </div>
      )}

      {feedback && (
        <div className="alert-box" role="status">
          {feedback}
        </div>
      )}

      <div className="admin-grid">
        {/* Left Column: Existing Single-SKU Products Table */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              Catalog SKUs ({products.length})
            </h2>
            <button
              type="button"
              onClick={handleResetForm}
              className="btn btn-outline btn-sm"
            >
              + New Product Form
            </button>
          </div>

          {!loaded ? (
            <p>Loading catalog...</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Illustrative Price</th>
                    <th>Stock &amp; Quick Adjust</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const stockBadge = getStockBadgeInfo(product.stock);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <img
                              src={product.image}
                              alt={product.name}
                              style={{
                                width: '44px',
                                height: '48px',
                                objectFit: 'contain',
                                backgroundColor: 'var(--surface-subtle)',
                                borderRadius: '4px',
                                padding: '3px',
                              }}
                            />
                            <div>
                              <strong className="admin-nowrap">{product.name}</strong>
                              <div
                                style={{
                                  fontSize: '0.76rem',
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {product.roastProfile} · {product.weight}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="admin-nowrap" style={{ fontWeight: 700 }}>
                          {formatETB(product.price)}
                        </td>
                        <td>
                          <div style={{ marginBottom: '6px' }}>
                            <span className={`badge badge-${stockBadge.status} admin-nowrap`}>
                              {stockBadge.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleQuickStockAdjust(product, -1)}
                              disabled={product.stock <= 0}
                              className="btn btn-neutral btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            >
                              −1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickStockAdjust(product, 1)}
                              className="btn btn-neutral btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickStockAdjust(product, 5)}
                              className="btn btn-neutral btn-sm"
                              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            >
                              +5
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(product)}
                            className={`btn btn-sm admin-nowrap ${
                              product.active ? 'btn-primary' : 'btn-neutral'
                            }`}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            {product.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleEditSelect(product)}
                            className="btn btn-outline btn-sm"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Add / Edit Single-SKU Product Form */}
        <form onSubmit={handleSubmit} className="card" noValidate>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              {formData.id ? `Edit ${formData.name}` : 'Add New Fictional SKU'}
            </h2>
            {formData.id && (
              <button
                type="button"
                onClick={handleResetForm}
                className="btn btn-neutral btn-sm"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {formErrors.form && (
            <div className="form-error" role="alert" style={{ marginBottom: '12px' }}>
              {formErrors.form}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="prod-name">
              Product Name *
            </label>
            <input
              id="prod-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., KORA No. 04"
              className="form-input"
            />
            {formErrors.name && <div className="form-error">{formErrors.name}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prod-desc">
              Illustrative Description *
            </label>
            <textarea
              id="prod-desc"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Fictional single-SKU packaged coffee concept description..."
              className="form-textarea"
            />
            {formErrors.description && (
              <div className="form-error">{formErrors.description}</div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="prod-price">
                Illustrative Price (`price_etb` &gt; 0) *
              </label>
              <input
                id="prod-price"
                type="number"
                step="any"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="650"
                className="form-input"
              />
              {formErrors.price && <div className="form-error">{formErrors.price}</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prod-stock">
                Stock Quantity (`stock_quantity` ≥ 0) *
              </label>
              <input
                id="prod-stock"
                type="number"
                step="1"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="10"
                className="form-input"
              />
              {formErrors.stock && <div className="form-error">{formErrors.stock}</div>}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="prod-weight">
                Net Weight (`net_weight_g`) *
              </label>
              <input
                id="prod-weight"
                type="text"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                placeholder="250g"
                className="form-input"
              />
              {formErrors.weight && (
                <div className="form-error">{formErrors.weight}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prod-roast">
                Roast Profile (`roast_profile`) *
              </label>
              <select
                id="prod-roast"
                value={formData.roastProfile}
                onChange={(e) =>
                  setFormData({ ...formData, roastProfile: e.target.value })
                }
                className="form-select"
              >
                <option value="Light Roast">Light Roast</option>
                <option value="Medium Roast">Medium Roast</option>
                <option value="Dark Roast">Dark Roast</option>
              </select>
              {formErrors.roastProfile && (
                <div className="form-error">{formErrors.roastProfile}</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prod-image">
              Package Illustration Asset (`image_path`)
            </label>
            <select
              id="prod-image"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              className="form-select"
            >
              <option value="/images/kora-no-01.svg">
                KORA No. 01 Bag (/images/kora-no-01.svg)
              </option>
              <option value="/images/kora-no-02.svg">
                KORA No. 02 Bag (/images/kora-no-02.svg)
              </option>
              <option value="/images/kora-no-03.svg">
                KORA No. 03 Bag (/images/kora-no-03.svg)
              </option>
              <option value="/images/kora-bag-default.svg">
                KORA Default Edition Bag (/images/kora-bag-default.svg)
              </option>
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="prod-active"
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              style={{ width: '18px', height: '18px' }}
            />
            <label htmlFor="prod-active" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Active (`is_active` — Visible in Customer Shop)
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {submitting
              ? 'Saving...'
              : formData.id
              ? 'Save Product Changes'
              : 'Add Single-SKU Product'}
          </button>
        </form>
      </div>
    </div>
  );
}
