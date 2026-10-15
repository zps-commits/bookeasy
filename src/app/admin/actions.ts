'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSession, destroySession } from '@/lib/auth/session';
import { requireAdmin } from '@/lib/auth/guard';
import { repository } from '@/lib/db';
import type { BookingStatus } from '@/types/booking';

export type LoginState = { error: string | null };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  // One message for a wrong password and for a panel that is switched off:
  // neither tells an attacker which of the two it is.
  if (!(await createSession(password))) return { error: 'Those details were not accepted.' };
  redirect('/admin');
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/admin/login');
}

export async function updateStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '') as BookingStatus;
  const allowed: BookingStatus[] = ['confirmed', 'cancelled', 'completed', 'no_show'];
  if (!id || !allowed.includes(status)) return;
  await repository().setBookingStatus(id, status);
  revalidatePath('/admin');
}
