import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Tone Yarthi
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Use your editorial team credentials to continue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
