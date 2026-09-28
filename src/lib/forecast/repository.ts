/**
 * BHUMI Forecast Repository — entry point
 * Returns mock when NEXT_PUBLIC_USE_MOCK_DATA=true, Supabase adapter otherwise.
 */
import { mockRepository } from './mock.ts';
import { supabaseRepository } from './supabase-adapter.ts';
import type { ForecastRepository } from './types.ts';

export function getRepository(): ForecastRepository {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return mockRepository;
  }
  return supabaseRepository;
}

export * from './types.ts';
