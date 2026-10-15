import { anonServerClient, supabaseConfigured } from './client';
import { memoryRepository } from './memory';
import type { BookingRepository } from './repository';
import { supabaseRepository } from './supabaseRepository';

/**
 * Which storage the application is running on.
 *
 * With no credentials configured it runs in memory, and the interface says
 * so rather than pretending to be connected to anything.
 */
export function repository(): BookingRepository {
  return supabaseConfigured ? supabaseRepository(anonServerClient()) : memoryRepository;
}

export const storageMode = (): 'supabase' | 'demo' => (supabaseConfigured ? 'supabase' : 'demo');

export type { BookingRepository };
