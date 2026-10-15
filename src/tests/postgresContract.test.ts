import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { repositoryContract } from './repositoryContract';

/**
 * The same contract, against a real PostgreSQL database.
 *
 * It runs only when DATABASE_URL points at a database you have authorised
 * for testing, because it writes and deletes rows. Without it the suite is
 * skipped loudly rather than passing quietly: an in-memory pass is not
 * evidence about PostgreSQL, and the exclusion constraint in particular
 * has no in-memory equivalent that proves anything about the database.
 *
 *   DATABASE_URL=postgres://... npm test
 */

const connectionString = process.env.DATABASE_URL?.trim() ?? '';
const enabled = connectionString.length > 0;

describe.skipIf(!enabled)('repository contract: postgres', () => {
  let repo: Awaited<ReturnType<typeof load>>['repo'];
  let close: () => Promise<void>;

  async function load() {
    const neon = await import("@/lib/db/providers/neon");
    return { repo: neon.neonRepository, close: neon.closePool };
  }

  beforeAll(async () => {
    const loaded = await load();
    repo = loaded.repo;
    close = loaded.close;
  });

  afterAll(async () => {
    if (close) await close();
  });

  /*
   * Rows written by the contract are removed between cases. This deletes
   * only what these tests create, by the customer name they use, and is
   * the reason the suite must point at a database authorised for testing.
   */
  beforeEach(async () => {
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString });
    try {
      await pool.query("delete from bookings where customer_contact = 'ana@example.test'");
      await pool.query("delete from availability_blocks where reason = 'Away'");
    } finally {
      await pool.end();
    }
  });

  const contract = repositoryContract(() => ({ repo, reset: async () => undefined }));

  it('reads a catalogue where every service has somebody to perform it', contract.readsACatalogue);
  it('stores money and duration as integers', contract.moneyIsIntegerCents);
  it('books a slot and refuses it afterwards', contract.booksAndBlocksTheSlot);
  // This is the case that only PostgreSQL can answer: the exclusion
  // constraint is what refuses the second concurrent insert.
  it('accepts exactly one of three concurrent attempts', contract.refusesConcurrentBookingsOfTheSameSlot);
  it('never leaks customer details through the busy list', contract.neverLeaksCustomerDetailsThroughBusy);
  it('cancels only with the right token, and only once', contract.cancelsOnlyWithTheRightToken);
  it('finds a booking only by its own token', contract.findsABookingOnlyByItsOwnToken);
  it('removes availability for a blocked period', contract.blocksRemoveAvailability);
});

describe.skipIf(enabled)('repository contract: postgres', () => {
  it.skip('skipped: DATABASE_URL is not set, so nothing here was run against a real database', () => {});
});
