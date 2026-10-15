import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
      <p className="section-title">Not found</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        There is nothing at this address.
      </h1>
      <p className="mt-4 max-w-prose text-muted">
        If you followed a booking link, check that you copied all of it. A link that is missing
        even one character will not match, and a link that does not match looks exactly like a
        booking that does not exist — deliberately, so the page cannot be used to go looking for
        other people&apos;s appointments.
      </p>
      <Link href="/" className="btn-primary pressable mt-7 inline-block">
        Back to the services
      </Link>
    </div>
  );
}
