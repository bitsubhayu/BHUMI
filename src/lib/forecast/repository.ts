/**
 * BHUMI Forecast Repository — entry point
 * Returns mock when NEXT_PUBLIC_USE_MOCK_DATA=true, Supabase adapter otherwise.
 */
import { mockRepository } from './mock';
import { supabaseRepository } from './supabase-adapter';
import type { ForecastRepository } from './types';

export function getRepository(): ForecastRepository {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    return mockRepository;
  }
  return supabaseRepository;
}

export * from './types';
