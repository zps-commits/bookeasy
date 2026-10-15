import { connection } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { repository } from '@/lib/db';
import { BOOKING_TIMEZONE } from '@/lib/config';
import { clockTime, longDate } from '@/lib/format';
import BlockForm from '@/components/admin/BlockForm';
import { removeBlock } from '../manage-actions';

export const metadata = { title: 'Availability' };

export default async function AdminAvailability() {
  await connection();
  await requireAdmin();

  const repo = repository();
  const now = new Date();
  const [professionals, blocks, hours] = await Promise.all([
    repo.listProfessionals(),
    repo.listBlocks(new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 180 * 86_400_000)),
    repo.listBusinessHours(),
  ]);

  const weekdayName = (weekday: number) =>
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday];
  const asClock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Availability</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Opening hours repeat every week. A block is a one-off absence that overrides them, and
        it cannot be added over a booking that already exists.
      </p>

      <h2 className="section-title mt-8">Opening hours</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {professionals.map((person) => {
          const mine = hours
            .filter((h) => h.professionalId === person.id)
            .sort((a, b) => a.weekday - b.weekday || a.opensMinute - b.opensMinute);
          return (
            <section key={person.id} className="panel p-5">
              <h3 className="font-medium">{person.name}</h3>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No opening hours set.</p>
              ) : (
                <dl className="mt-3 space-y-1 text-sm">
                  {mine.map((h) => (
                    <div key={`${h.weekday}-${h.opensMinute}`} className="flex justify-between gap-4">
                      <dt className="text-muted">{weekdayName(h.weekday)}</dt>
                      <dd className="font-mono">
                        {asClock(h.opensMinute)}–{asClock(h.closesMinute)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          );
        })}
      </div>

      <h2 className="section-title mt-10">Blocked periods</h2>
      {blocks.length === 0 ? (
        <p className="panel mt-3 p-5 text-sm text-muted">Nothing blocked.</p>
      ) : (
        <ul className="panel mt-3 divide-y divide-line">
          {blocks.map((block) => {
            const person = professionals.find((p) => p.id === block.professionalId);
            return (
              <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{person?.name ?? 'Unknown'}</p>
                  <p className="mt-0.5 font-mono text-sm text-muted">
                    {longDate(block.startsAt, BOOKING_TIMEZONE)}{' '}
                    {clockTime(block.startsAt, BOOKING_TIMEZONE)}–
                    {clockTime(block.endsAt, BOOKING_TIMEZONE)}
                  </p>
                  {block.reason ? <p className="mt-0.5 text-sm text-muted">{block.reason}</p> : null}
                </div>
                <form action={removeBlock}>
                  <input type="hidden" name="id" value={block.id} />
                  <button type="submit" className="btn-quiet pressable py-2 text-negative">
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="section-title mt-10">Block a period</h2>
      <BlockForm professionals={professionals.map((p) => ({ id: p.id, name: p.name }))} />
    </>
  );
}
