import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeading } from '../../../components/page-heading';
import { adminApi } from '../../../lib/admin-api';

interface Playlist {
  id: string;
  slug: string;
  titleMy: string;
  isActive: boolean;
  scheduleType: string;
  articleCount: number;
  updatedAt: string;
}
export default async function PlaylistsPage() {
  const { items } = await adminApi<{ items: Playlist[] }>(
    '/v1/admin/playlists',
  );
  return (
    <>
      <PageHeading
        title="Playlists"
        description="Curate ordered listening collections."
      />
      <div className="space-y-5 p-10">
        <div className="flex justify-end">
          <Link href="/playlists/new" className="button">
            <Plus size={16} />
            New playlist
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-4">Name</th>
                <th>Schedule</th>
                <th>Articles</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="p-4">
                    <div className="font-semibold" lang="my">
                      {item.titleMy}
                    </div>
                    <code className="text-xs text-slate-500">{item.slug}</code>
                  </td>
                  <td className="capitalize">{item.scheduleType}</td>
                  <td>{item.articleCount}</td>
                  <td>
                    <span
                      className={
                        item.isActive ? 'text-emerald-700' : 'text-slate-500'
                      }
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="pr-4 text-right">
                    <Link
                      className="text-indigo-600 hover:underline"
                      href={`/playlists/${item.id}`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="p-10 text-center text-sm text-slate-500">
              No playlists yet.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
