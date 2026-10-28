/**
 * KORA Roasters — Server Supabase Client (`@supabase/ssr`)
 *
 * Follows Next.js App Router server conventions for reading/writing auth cookies
 * and verifying admin status on the server via `auth.getUser()` and `public.is_kora_admin()`.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicConfig } from './config.js';

export function createKoraServerClient() {
  const { url, publishableKey, isConfigured } = getSupabasePublicConfig();

  if (!isConfigured) {
    throw new Error(
      'Supabase mode is active, but NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing in .env.local.'
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where setting cookies is a no-op
          // (Middleware or Server Actions handle session refresh).
        }
      },
    },
  });
}

/**
 * Verifies on the server that the current request has an authenticated Supabase
 * session AND that `public.is_kora_admin()` returns true for that user.
 */
export async function verifyServerAdminSession() {
  try {
    const supabase = createKoraServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        authorized: false,
        user: null,
        error: 'Please sign in with an authorized KORA admin account.',
      };
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_kora_admin');

    if (adminError || !isAdmin) {
      return {
        authorized: false,
        user: null,
        error:
          'Your account is signed in, but is not listed in public.kora_admins. Access denied.',
      };
    }

    return {
      authorized: true,
      user: {
        id: user.id,
        label: 'Authorized Admin',
      },
      supabase,
    };
  } catch (err) {
    return {
      authorized: false,
      user: null,
      error: err?.message || 'Unable to verify admin session with Supabase.',
    };
  }
}
