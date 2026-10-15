'use client';

import { useEffect } from 'react';

/**
 * The last line before a blank page. The message is deliberately vague: a
 * stack trace or a database error can carry schema detail that a visitor
 * has no business reading. The digest is enough to find it in the logs.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
      <p className="section-title">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        That did not work, and nothing was changed.
      </h1>
      <p className="mt-4 max-w-prose text-muted">
        Nothing was booked or cancelled. Try again, and if it keeps happening the business can
        take the booking directly.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <button type="button" onClick={reset} className="btn-primary pressable mt-7">
        Try again
      </button>
    </div>
  );
}
