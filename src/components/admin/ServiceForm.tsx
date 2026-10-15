'use client';

import { useActionState, useId } from 'react';
import { saveService, type ServiceFormState } from '@/app/admin/manage-actions';

const initial: ServiceFormState = { error: null };

export default function ServiceForm() {
  const [state, action, pending] = useActionState(saveService, initial);
  const ids = {
    name: useId(),
    description: useId(),
    duration: useId(),
    price: useId(),
    currency: useId(),
    active: useId(),
  };

  return (
    <form action={action} className="panel mt-3 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={ids.name} className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input id={ids.name} name="name" required maxLength={120} className="field" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={ids.description} className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <textarea
            id={ids.description}
            name="description"
            rows={2}
            maxLength={600}
            className="field"
          />
        </div>

        <div>
          <label htmlFor={ids.duration} className="mb-1.5 block text-sm font-medium">
            Minutes
          </label>
          <input
            id={ids.duration}
            name="durationMinutes"
            type="number"
            min={5}
            max={480}
            step={5}
            defaultValue={60}
            required
            className="field"
          />
        </div>

        <div>
          <label htmlFor={ids.price} className="mb-1.5 block text-sm font-medium">
            Price, in cents
          </label>
          <input
            id={ids.price}
            name="priceCents"
            type="number"
            min={0}
            step={1}
            defaultValue={0}
            required
            className="field"
          />
          <p className="mt-1.5 text-xs text-muted">
            Integer cents, so 35000 is 350.00. Money is never a decimal here.
          </p>
        </div>

        <div>
          <label htmlFor={ids.currency} className="mb-1.5 block text-sm font-medium">
            Currency
          </label>
          <select id={ids.currency} name="currency" defaultValue="BRL" className="field">
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-7">
          <input id={ids.active} name="active" type="checkbox" defaultChecked className="size-4" />
          <label htmlFor={ids.active} className="text-sm">
            Offer it straight away
          </label>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary pressable mt-5">
        {pending ? 'Saving…' : 'Add service'}
      </button>
    </form>
  );
}
