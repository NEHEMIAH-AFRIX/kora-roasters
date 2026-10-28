/**
 * KORA Roasters — Data Mode & Public Supabase Environment Configuration
 *
 * SECURITY NOTE:
 * - Only public variables (`NEXT_PUBLIC_KORA_DATA_MODE`, `NEXT_PUBLIC_SUPABASE_URL`,
 *   and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) are read here.
 * - Never log, print, or expose credential values.
 * - Never use a service-role key in browser or client-accessible code.
 */

export function getDataMode() {
  const raw = (process.env.NEXT_PUBLIC_KORA_DATA_MODE || 'mock').trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'mock';
}

export function isSupabaseMode() {
  return getDataMode() === 'supabase';
}

export function getSupabasePublicConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return {
    url,
    publishableKey,
    isConfigured: Boolean(url && publishableKey),
  };
}
