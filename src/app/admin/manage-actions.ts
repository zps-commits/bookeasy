'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guard';
import { repository } from '@/lib/supabase';
import { blockSchema, serviceSchema } from '@/lib/validation/schemas';

/** Catalogue and availability management. Every action guards first. */

export type ServiceFormState = { error: string | null };

export async function saveService(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  await requireAdmin();
  const parsed = serviceSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    durationMinutes: formData.get('durationMinutes'),
    priceCents: formData.get('priceCents'),
    currency: formData.get('currency'),
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the service details.' };
  }

  const id = String(formData.get('id') ?? '').trim();
  await repository().upsertService({
    ...(id ? { id } : {}),
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    durationMinutes: parsed.data.durationMinutes,
    priceCents: parsed.data.priceCents,
    currency: parsed.data.currency,
    active: parsed.data.active,
  });
  revalidatePath('/admin/services');
  revalidatePath('/');
  return { error: null };
}

export type BlockFormState = { error: string | null };

export async function addBlock(
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  await requireAdmin();
  const parsed = blockSchema.safeParse({
    professionalId: formData.get('professionalId'),
    startsAt: formData.get('startsAt'),
    endsAt: formData.get('endsAt'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the dates.' };
  }

  await repository().createBlock({
    professionalId: parsed.data.professionalId,
    startsAt: new Date(parsed.data.startsAt),
    endsAt: new Date(parsed.data.endsAt),
    reason: parsed.data.reason ?? null,
  });
  revalidatePath('/admin/availability');
  return { error: null };
}

export async function removeBlock(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await repository().deleteBlock(id);
  revalidatePath('/admin/availability');
}
