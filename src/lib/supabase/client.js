/**
 * KORA Roasters — Browser Supabase Client (`@supabase/ssr`)
 *
 * Uses only the public URL and publishable key with Row-Level Security (RLS).
 * Never uses a service-role key.
 */

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './config.js';

let browserClientInstance = null;

export function createKoraBrowserClient() {
  const { url, publishableKey, isConfigured } = getSupabasePublicConfig();

  if (!isConfigured) {
    throw new Error(
      'Supabase mode is active, but NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing in .env.local.'
    );
  }

  if (!browserClientInstance) {
    browserClientInstance = createBrowserClient(url, publishableKey);
  }

  return browserClientInstance;
}
