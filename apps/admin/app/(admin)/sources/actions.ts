'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '../../../lib/admin-api';

export async function updateSource(formData: FormData) {
  const slug = String(formData.get('slug') ?? '');
  const priority = Number(formData.get('priority'));
  const isActive = formData.get('isActive') === 'on';
  await adminApi(`/v1/admin/sources/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive, priority }),
  });
  revalidatePath('/sources');
}
