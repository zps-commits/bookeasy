import Link from 'next/link';
import { signOut } from './actions';

export const metadata = { robots: { index: false, follow: false } };

const LINKS = [
  ['/admin', 'Agenda'],
  ['/admin/services', 'Services'],
  ['/admin/availability', 'Availability'],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <nav aria-label="Administration" className="flex flex-wrap gap-1">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="pressable rounded-field px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action={signOut}>
          <button type="submit" className="pressable text-sm text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
