'use client';

import { useActionState, useState } from 'react';
import { cancelBooking, type CancelState } from '@/app/actions';

const initial: CancelState = { error: null, cancelled: false };

export default function CancelBooking({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(cancelBooking, initial);

  if (state.cancelled) {
    return (
      <p role="status" className="mt-6 text-sm font-medium text-positive">
        Cancelled. The time is free again for someone else.
      </p>
    );
  }

  if (!confirming) {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn-quiet pressable text-negative"
        >
          Cancel this booking
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 rounded-panel border border-line bg-surface p-5">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm">Cancel this booking? The time goes back on offer immediately.</p>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-primary pressable">
          {pending ? 'Cancelling…' : 'Yes, cancel it'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-quiet pressable">
          Keep it
        </button>
      </div>
    </form>
  );
}
