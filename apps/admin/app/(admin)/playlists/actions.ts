'use server';

import { redirect } from 'next/navigation';
import { adminApi } from '../../../lib/admin-api';

export async function savePlaylist(payload: {
  id?: string;
  titleMy: string;
  slug: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  scheduleType: string;
  articleIds: string[];
}) {
  await adminApi(
    `/v1/admin/playlists${payload.id ? `/${encodeURIComponent(payload.id)}` : ''}`,
    {
      method: payload.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  redirect('/playlists');
}

export async function searchArticles(query: string) {
  return adminApi<{ items: PlaylistArticle[] }>(
    `/v1/admin/playlists/articles?q=${encodeURIComponent(query)}`,
  );
}

export interface PlaylistArticle {
  id: string;
  title: string;
  titleMy: string | null;
  publishedAt: string;
  audioUrl: string;
}
