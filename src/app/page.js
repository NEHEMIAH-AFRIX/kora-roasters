'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getProducts,
  fetchActiveProductsAsync,
  getStockBadgeInfo,
  formatETB,
} from '../lib/koraRepository';

export default function HomePage() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (mounted) {
        setProducts(getProducts({ includeInactive: false }));
      }
    };
    fetchActiveProductsAsync().then((res) => {
      if (mounted && res.ok) {
        setProducts(res.products);
      }
    });
    sync();
    window.addEventListener('kora-store-updated', sync);
    return () => {
      mounted = false;
      window.removeEventListener('kora-store-updated', sync);
    };
  }, []);

  // Primary featured sample product (KORA No. 01 or first active SKU)
  const featuredProduct =
    products.find(
      (p) => p.id === 'kora-no-01' || String(p.name).toLowerCase() === 'kora no. 01'
    ) ||
    products[0] || {
      id: 'kora-no-01',
      name: 'KORA No. 01',
      description:
        'Fictional single-SKU packaged coffee concept featuring a balanced medium roast profile intended for everyday filter and immersion routines. Sample product details and ETB pricing are illustrative.',
      price: 650,
      weight: '250g',
      roastProfile: 'Medium Roast',
      image: '/images/kora-no-01.svg',
      stock: 12,
    };

  const featuredBadge = getStockBadgeInfo(featuredProduct.stock);

  return (
    <div>
      {/* =================================================================== */}
      {/* EDITORIAL HERO: Reading Flow                                        */}
      {/* Logo (Header) → Navigation → Eyebrow → Headline → Description       */}
      {/* → CTA → Trust Statement → Primary Product Anchor                    */}
      {/* =================================================================== */}
      <section className="editorial-hero" aria-labelledby="hero-heading">
        {/* Left Column: Editorial Hierarchy & Conversion Actions */}
        <div>
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-line" aria-hidden="true" />
            <span>01 / Morning Ritual · Packaged Coffee</span>
          </div>

          <h1 id="hero-heading" className="hero-headline">
            Let the day begin slowly.
          </h1>

          <p className="hero-lead">
            Before the pace of the day gathers, there is the quiet cadence of
            measuring, pouring, and waiting. Choose a roast suited to your daily
            ritual—whether a steady filter brew, a bright pour-over, or a richer
            moka pot routine—and explore the collection at your own pace.
          </p>

          <div className="hero-cta-row">
            <Link href="/shop" className="btn btn-primary">
              <span>Explore the collection</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <a href="#how-ordering-works" className="quiet-link">
              <span>How ordering works</span>
              <span className="quiet-link-arrow quiet-link-arrow-down" aria-hidden="true">
                ↓
              </span>
            </a>
          </div>

          {/* Subtle Editorial Trust & Craft Statement */}
          <div className="hero-trust-statement" aria-label="Brand craft statement">
            <span>Small-batch roasted.</span>
            <span className="hero-trust-dot" aria-hidden="true">
              ·
            </span>
            <span>Seasonal roasts.</span>
            <span className="hero-trust-dot" aria-hidden="true">
              ·
            </span>
            <span>Crafted for slower mornings.</span>
          </div>

          {/* Quiet Architectural Specifications */}
          <div className="hero-ritual-notes" aria-label="Collection specifications">
            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: '2px',
                }}
              >
                Roast Profiles
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                Light, Medium &amp; Dark
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: '2px',
                }}
              >
                Release Format
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                250g Whole Bean Pouch
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: '2px',
                }}
              >
                Ordering Model
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                Request First · No Instant Pay
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Primary Visual Anchor — Elevated Product Showcase */}
        <div className="hero-visual-stage">
          <div className="hero-stage-inner">
            <div className="hero-stage-meta-top">
              <span>Featured Release · 07:00 AM Ritual</span>
              <span>Edition {featuredProduct.weight}</span>
            </div>

            <Link
              href={`/shop/${featuredProduct.id}`}
              className="hero-pouch-showcase-link"
              aria-label={`Inspect ${featuredProduct.name} (${featuredProduct.roastProfile}, ${featuredProduct.weight})`}
            >
              <img
                src={featuredProduct.image}
                alt={`${featuredProduct.name} 250g packaged coffee pouch in a warm neutral studio setting`}
                className="hero-pouch-image"
              />
            </Link>

            <div className="hero-stage-footer">
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Link
                    href={`/shop/${featuredProduct.id}`}
                    style={{
                      fontFamily:
                        "'Iowan Old Style', Baskerville, 'Palatino Linotype', Georgia, serif",
                      fontWeight: 700,
                      fontSize: '1.2rem',
                    }}
                  >
                    {featuredProduct.name}
                  </Link>
                  <span className={`badge badge-${featuredBadge.status}`}>
                    {featuredBadge.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    marginTop: '3px',
                  }}
                >
                  {featuredProduct.roastProfile} · {featuredProduct.weight} ·{' '}
                  <strong style={{ color: 'var(--kora-espresso)' }}>
                    {formatETB(featuredProduct.price)}
                  </strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>(Illustrative)</span>
                </div>
              </div>

              <Link
                href={`/shop/${featuredProduct.id}`}
                className="quiet-link"
                style={{ padding: '6px 2px', fontSize: '0.85rem' }}
              >
                <span>Inspect Release</span>
                <span className="quiet-link-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* FEATURED SAMPLE PRODUCT SPOTLIGHT                                   */}
      {/* =================================================================== */}
      <section
        className="featured-ritual-section"
        aria-labelledby="featured-release-heading"
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div>
            <p
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              02 / Featured Daily Release
            </p>
            <h2
              id="featured-release-heading"
              style={{
                fontFamily:
                  "'Iowan Old Style', Baskerville, 'Palatino Linotype', Georgia, serif",
                fontSize: '1.75rem',
                fontWeight: 600,
              }}
            >
              A balanced starting point for the morning table
            </h2>
          </div>

          <Link href="/shop" className="quiet-link">
            <span>See all three releases in the Shop</span>
            <span className="quiet-link-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        <article className="featured-spotlight-grid">
          <Link
            href={`/shop/${featuredProduct.id}`}
            style={{
              backgroundColor: 'var(--surface-subtle)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '4px',
              padding: '28px 20px',
              textAlign: 'center',
              display: 'block',
            }}
          >
            <img
              src={featuredProduct.image}
              alt={`${featuredProduct.name} (${featuredProduct.roastProfile}, ${featuredProduct.weight}) sample package`}
              style={{
                width: '100%',
                maxHeight: '300px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 14px 20px rgba(44, 33, 30, 0.09))',
              }}
            />
          </Link>

          <div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <span className={`badge badge-${featuredBadge.status}`}>
                {featuredBadge.label}
              </span>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                Single-SKU Concept · {featuredProduct.weight}
              </span>
            </div>

            <h3
              style={{
                fontFamily:
                  "'Iowan Old Style', Baskerville, 'Palatino Linotype', Georgia, serif",
                fontSize: '1.85rem',
                fontWeight: 600,
                marginBottom: '10px',
              }}
            >
              <Link href={`/shop/${featuredProduct.id}`}>{featuredProduct.name}</Link>
            </h3>

            <p
              style={{
                fontSize: '0.96rem',
                color: 'var(--text-secondary)',
                marginBottom: '22px',
                maxWidth: '540px',
                lineHeight: 1.65,
              }}
            >
              {featuredProduct.description}
            </p>

            {/* Key Sample Product Attributes */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '14px',
                padding: '16px 0',
                borderTop: '1px solid var(--border-neutral)',
                borderBottom: '1px solid var(--border-neutral)',
                marginBottom: '24px',
                fontSize: '0.88rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Roast Profile
                </span>
                <strong>{featuredProduct.roastProfile}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Net Weight
                </span>
                <strong>{featuredProduct.weight}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Illustrative Price
                </span>
                <strong>{formatETB(featuredProduct.price)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Stock Status
                </span>
                <strong>{featuredBadge.shortLabel}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <Link
                href={`/shop/${featuredProduct.id}`}
                className="btn btn-primary"
              >
                <span>Inspect {featuredProduct.name}</span>
                <span className="btn-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              <Link href="/shop" className="quiet-link">
                <span>Explore the full collection</span>
                <span className="quiet-link-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </div>
          </div>
        </article>
      </section>

      {/* =================================================================== */}
      {/* HOW ORDERING WORKS (Anchor Target for Secondary Hero Link)          */}
      {/* =================================================================== */}
      <section
        id="how-ordering-works"
        className="ordering-steps-section"
        aria-labelledby="ordering-heading"
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '20px',
            gap: '8px',
          }}
        >
          <div>
            <p
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              03 / Request-Only Process
            </p>
            <h2
              id="ordering-heading"
              style={{
                fontFamily:
                  "'Iowan Old Style', Baskerville, 'Palatino Linotype', Georgia, serif",
                fontSize: '1.65rem',
                fontWeight: 600,
              }}
            >
              How ordering works
            </h2>
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Shop → Product Detail → Cart → Order Request → Pending Confirmation
          </span>
        </div>

        <div className="product-grid">
          <div className="card">
            <div className="badge badge-in" style={{ marginBottom: '12px' }}>
              01 · Choose Your Roast
            </div>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px' }}>
              Browse the Collection &amp; Live Stock
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Explore KORA No. 01, No. 02, and No. 03. Each release displays its
              illustrative roast profile, 250g net weight, price, and current stock
              availability.
            </p>
          </div>

          <div className="card">
            <div className="badge badge-in" style={{ marginBottom: '12px' }}>
              02 · Submit an Order Request
            </div>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px' }}>
              One Contact Method · No Online Payment
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Review your cart and submit a request with your name and either an email
              address or phone number. No account creation or online payment is taken.
            </p>
          </div>

          <div className="card">
            <div className="badge badge-in" style={{ marginBottom: '12px' }}>
              03 · Save Your Pending Reference
            </div>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px' }}>
              Pending Confirmation &amp; Admin Review
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Every request receives a unique reference (such as <code>KR-A7F29C</code>)
              with a <strong>Pending</strong> status until reviewed and confirmed in the
              Demo Admin view.
            </p>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECONDARY CONCEPT DISCLOSURE STRIP (Moved out of the main hero)     */}
      {/* =================================================================== */}
      <aside
        className="concept-disclosure-strip"
        aria-label="Portfolio concept disclosure"
      >
        <div>
          <strong style={{ color: 'var(--kora-espresso)' }}>
            Concept Disclosure:
          </strong>{' '}
          KORA Roasters is a fictional portfolio prototype. Product descriptions, roast
          profiles, and ETB prices are illustrative only.
        </div>
        <Link href="/admin" className="quiet-link" style={{ padding: '4px 0', fontSize: '0.8rem' }}>
          <span>Open Demo Admin View</span>
          <span className="quiet-link-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </aside>
    </div>
  );
}
