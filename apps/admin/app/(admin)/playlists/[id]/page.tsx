import { PageHeading } from '../../../../components/page-heading';
import { adminApi } from '../../../../lib/admin-api';
import { PlaylistEditor, PlaylistValue } from '../playlist-editor';
export default async function EditPlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const value = await adminApi<PlaylistValue>(
    `/v1/admin/playlists/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <PageHeading
        title="Edit playlist"
        description="Update details and article order."
      />
      <div className="p-10">
        <PlaylistEditor value={value} />
      </div>
    </>
  );
}
