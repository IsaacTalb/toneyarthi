import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'toneyarthi_admin_session';
const SESSION_AGE_SECONDS = 60 * 60 * 8;

export interface AdminSession {
  email: string;
  expiresAt: number;
}

function config() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters');
  }
  return secret;
}

function encode(value: string | Uint8Array) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString('base64url');
}

function equal(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

async function signature(value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(config()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return encode(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
    ),
  );
}

async function serialize(session: AdminSession) {
  const payload = encode(JSON.stringify(session));
  return `${payload}.${await signature(payload)}`;
}

async function parse(value?: string): Promise<AdminSession | null> {
  const [payload, suppliedSignature, extra] = value?.split('.') ?? [];
  if (!payload || !suppliedSignature || extra) return null;
  if (!equal(suppliedSignature, await signature(payload))) return null;
  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as AdminSession;
    if (!session.email || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createSession(email: string) {
  const expiresAt = Date.now() + SESSION_AGE_SECONDS * 1000;
  (await cookies()).set(COOKIE_NAME, await serialize({ email, expiresAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession() {
  return parse((await cookies()).get(COOKIE_NAME)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
