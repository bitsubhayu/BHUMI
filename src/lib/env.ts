/**
 * BHUMI Environment Configuration & Validation Helper
 * 
 * Provides safe access to environment variables across client and server runtimes.
 * Gracefully handles missing variables during initial development and CI testing
 * without throwing unhandled exceptions.
 */

export interface PublicClientEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  isConfigured: boolean;
}

export interface ServerEnv extends PublicClientEnv {
  supabaseServiceRoleKey: string | undefined;
  bhashiniApiKey: string | undefined;
  bhashiniUserId: string | undefined;
  bhashiniPipelineId: string | undefined;
}

/**
 * Returns public environment variables accessible in the browser.
 */
export function getPublicEnv(): PublicClientEnv {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseUrl.length > 0 &&
    supabaseAnonKey &&
    supabaseAnonKey.length > 0
  );

  return {
    supabaseUrl,
    supabaseAnonKey,
    isConfigured,
  };
}

/**
 * Returns server-only environment variables.
 * Safe to call in Server Components, Route Handlers, or Server Actions.
 */
export function getServerEnv(): ServerEnv {
  const publicEnv = getPublicEnv();

  return {
    ...publicEnv,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    bhashiniApiKey: process.env.BHASHINI_API_KEY?.trim(),
    bhashiniUserId: process.env.BHASHINI_USER_ID?.trim(),
    bhashiniPipelineId: process.env.BHASHINI_PIPELINE_ID?.trim(),
  };
}

/**
 * Quick boolean check for whether Supabase database connectivity is configured.
 */
export function isSupabaseConfigured(): boolean {
  return getPublicEnv().isConfigured;
}
