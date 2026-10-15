import { memoryRepository } from './providers/memory';
import { neonRepository, postgresConfigured } from './providers/neon';
import type { BookingRepository } from './repository';

/**
 * Which storage the application is running on.
 *
 * Application code imports from here and names no provider. Choosing one
 * is this file and the folder beneath it.
 */
export type StorageMode = 'postgres' | 'demo';

export function storageMode(): StorageMode {
  return postgresConfigured() ? 'postgres' : 'demo';
}

export function repository(): BookingRepository {
  return storageMode() === 'postgres' ? neonRepository : memoryRepository;
}

export type { BookingRepository };
export type { CustomerBookingView, CreateBookingInput, CreateBookingResult } from './repository';
