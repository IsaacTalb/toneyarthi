import { PageHeading } from '../../../../components/page-heading';
import { PlaylistEditor } from '../playlist-editor';
export default function NewPlaylistPage() {
  return (
    <>
      <PageHeading
        title="New playlist"
        description="Create an ordered audio collection."
      />
      <div className="p-10">
        <PlaylistEditor
          value={{
            titleMy: '',
            slug: '',
            description: null,
            imageUrl: null,
            isActive: false,
            scheduleType: 'manual',
            articles: [],
          }}
        />
      </div>
    </>
  );
}
