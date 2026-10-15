'use client';

import { useActionState, useId } from 'react';
import { signIn, type LoginState } from '@/app/admin/actions';

const initial: LoginState = { error: null };

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const id = useId();

  return (
    <form action={action} className="panel mt-6 p-5 sm:p-6">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        Password
      </label>
      <input
        id={id}
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="field"
      />
      {state.error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary pressable mt-5 w-full">
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
