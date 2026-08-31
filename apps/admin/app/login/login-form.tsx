'use client';

import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
        />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-500"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
