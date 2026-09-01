'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '../../../lib/admin-api';

export async function retryJob(formData: FormData) {
  const id = String(formData.get('jobId') ?? '');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid job id');
  await adminApi(`/v1/admin/processing/jobs/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  });
  revalidatePath('/processing');
  revalidatePath('/');
}
