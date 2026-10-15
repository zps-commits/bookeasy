import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { site } from '@/lib/config';
import { storageMode } from '@/lib/db';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: `${site.name} — online booking`, template: `%s | ${site.name}` },
  description:
    'Online booking for people who work by appointment. Pick a service, pick a time that is genuinely free, and cancel with a private link.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = storageMode() === 'demo';

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-surface"
        >
          Skip to content
        </a>

        {demo ? (
          <p className="bg-accent-deep px-5 py-2 text-center text-xs text-on-deep">
            Demonstration mode. Bookings are held in memory and disappear when the server
            restarts. No database is connected.
          </p>
        ) : null}

        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="text-base font-semibold tracking-tight">
              {site.name}
            </Link>
            <span className="text-sm text-muted">{site.tagline}</span>
          </div>
        </header>

        <main id="content">{children}</main>

        <footer className="mt-16 border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-8 text-xs leading-relaxed text-muted sm:px-8">
            A demonstration of an online booking tool. The business, the services and the people
            named here are invented, and no real contact detail appears anywhere.
          </div>
        </footer>
      </body>
    </html>
  );
}
