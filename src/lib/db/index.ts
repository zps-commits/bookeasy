import { memoryRepository } from './providers/memory';
import type { BookingRepository } from './repository';
import { supabaseConfigured, anonServerClient } from './providers/supabaseClient';
import { supabaseRepository } from './providers/supabase';

/**
 * Which storage the application is running on.
 *
 * Application code imports from here and nowhere else. No route, action or
 * component names a provider: swapping one is a change to this file and to
 * one folder beneath it.
 */
export type StorageMode = 'postgres' | 'supabase' | 'demo';

export function storageMode(): StorageMode {
  if (supabaseConfigured) return 'supabase';
  return 'demo';
}

export function repository(): BookingRepository {
  return storageMode() === 'supabase' ? supabaseRepository(anonServerClient()) : memoryRepository;
}

export type { BookingRepository };
export type { CustomerBookingView, CreateBookingInput, CreateBookingResult } from './repository';
