'use server';

import { redirect } from 'next/navigation';
import { createSession, destroySession } from '../../lib/session';

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1)
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export async function login(_state: { error: string }, formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const expectedPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!expectedEmail || !expectedPassword)
    return { error: 'Admin sign-in is not configured.' };
  if (
    !constantTimeEqual(email, expectedEmail) ||
    !constantTimeEqual(password, expectedPassword)
  ) {
    return { error: 'Email or password is incorrect.' };
  }
  await createSession(email);
  redirect('/');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
