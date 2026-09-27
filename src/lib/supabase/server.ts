/**
 * Server-side Supabase Client
 * 
 * Used in React Server Components, Route Handlers, and Server Actions.
 * Handles missing credentials gracefully without breaking page builds or serverless renders.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';
import type { Database } from './types';

export function getSupabaseServerClient(useServiceRole = false): SupabaseClient<Database> | null {
  const env = getServerEnv();

  const url = env.supabaseUrl;
  const key = useServiceRole ? env.supabaseServiceRoleKey : env.supabaseAnonKey;

  if (!url || !key) {
    return null;
  }

  try {
    return createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (error) {
    console.warn('[BHUMI Supabase Server] Failed to initialize server client:', error);
    return null;
  }
}
