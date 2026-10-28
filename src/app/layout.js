import React from 'react';
import './globals.css';
import AppShell from '../components/AppShell';

export const metadata = {
  title: 'KORA Roasters — V1 Portfolio Concept Prototype',
  description:
    'Fictional packaged-coffee brand portfolio project featuring customer order-request and admin inventory/order management flows.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
