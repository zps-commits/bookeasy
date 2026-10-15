'use client';

import { useActionState, useId } from 'react';
import { addBlock, type BlockFormState } from '@/app/admin/manage-actions';

const initial: BlockFormState = { error: null };

export default function BlockForm({
  professionals,
}: {
  professionals: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(addBlock, initial);
  const ids = { who: useId(), from: useId(), to: useId(), why: useId() };

  return (
    <form action={action} className="panel mt-3 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.who} className="mb-1.5 block text-sm font-medium">
            Who
          </label>
          <select id={ids.who} name="professionalId" required className="field">
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={ids.why} className="mb-1.5 block text-sm font-medium">
            Reason
          </label>
          <input id={ids.why} name="reason" maxLength={200} className="field" />
          <p className="mt-1.5 text-xs text-muted">Only you see this.</p>
        </div>

        <div>
          <label htmlFor={ids.from} className="mb-1.5 block text-sm font-medium">
            From
          </label>
          <input id={ids.from} name="startsAt" type="datetime-local" required className="field" />
        </div>

        <div>
          <label htmlFor={ids.to} className="mb-1.5 block text-sm font-medium">
            Until
          </label>
          <input id={ids.to} name="endsAt" type="datetime-local" required className="field" />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary pressable mt-5">
        {pending ? 'Blocking…' : 'Block this period'}
      </button>
    </form>
  );
}
