import { beforeEach, describe, it } from 'vitest';
import { memoryRepository, resetMemoryRepository } from '@/lib/db/providers/memory';
import { repositoryContract } from './repositoryContract';

/** The contract, run against the in-memory provider. */
describe('repository contract: in-memory', () => {
  beforeEach(() => resetMemoryRepository());

  const contract = repositoryContract(() => ({
    repo: memoryRepository,
    reset: async () => resetMemoryRepository(),
  }));

  it('reads a catalogue where every service has somebody to perform it', contract.readsACatalogue);
  it('stores money and duration as integers', contract.moneyIsIntegerCents);
  it('books a slot and refuses it afterwards', contract.booksAndBlocksTheSlot);
  it('accepts exactly one of three concurrent attempts', contract.refusesConcurrentBookingsOfTheSameSlot);
  it('never leaks customer details through the busy list', contract.neverLeaksCustomerDetailsThroughBusy);
  it('cancels only with the right token, and only once', contract.cancelsOnlyWithTheRightToken);
  it('finds a booking only by its own token', contract.findsABookingOnlyByItsOwnToken);
  it('removes availability for a blocked period', contract.blocksRemoveAvailability);
});
