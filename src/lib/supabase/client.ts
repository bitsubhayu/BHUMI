/**
 * Client-side Supabase Browser Client
 * 
 * Provides safe access to the Supabase client in client components.
 * If credentials are missing in development, this gracefully returns null
 * rather than crashing the application runtime.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';
import type { Database } from './types';

let cachedClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const { supabaseUrl, supabaseAnonKey, isConfigured } = getPublicEnv();

  if (!isConfigured || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    cachedClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return cachedClient;
  } catch (error) {
    console.warn('[BHUMI Supabase Client] Failed to initialize client:', error);
    return null;
  }
}
