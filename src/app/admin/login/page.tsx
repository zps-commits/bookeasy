import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { adminUnavailableReason, isSignedIn } from '@/lib/auth/session';
import LoginForm from '@/components/admin/LoginForm';

export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function LoginPage() {
  await connection();
  if (await isSignedIn()) redirect('/admin');
  const unavailable = adminUnavailableReason();

  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>

      {unavailable ? (
        <div className="panel mt-6 p-5">
          <p className="text-sm leading-relaxed text-muted">{unavailable}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            There is deliberately no default password. A demonstration that ships with one is a
            demonstration of how to get broken into.
          </p>
        </div>
      ) : (
        <LoginForm />
      )}
    </div>
  );
}
