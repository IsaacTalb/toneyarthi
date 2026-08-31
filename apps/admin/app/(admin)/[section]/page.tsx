import { notFound } from 'next/navigation';
import { PageHeading } from '../../../components/page-heading';

const sections: Record<string, { title: string; description: string }> = {
  articles: {
    title: 'Articles',
    description: 'Browse and manage every article in the newsroom.',
  },
  candidates: {
    title: 'Candidates',
    description: 'Inspect newly ingested stories before processing.',
  },
  review: {
    title: 'Review',
    description: 'Review generated stories and approve publication.',
  },
  published: {
    title: 'Published',
    description: 'Manage stories currently available to readers.',
  },
  sources: {
    title: 'Sources',
    description: 'Configure feeds and monitor source reliability.',
  },
  categories: {
    title: 'Categories',
    description: 'Organize the editorial taxonomy.',
  },
  playlists: {
    title: 'Playlists',
    description: 'Curate ordered listening collections.',
  },
  processing: {
    title: 'Processing',
    description: 'Monitor jobs, retries, and pipeline health.',
  },
  settings: {
    title: 'Settings',
    description: 'Manage newsroom preferences and integrations.',
  },
};

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const page = sections[section];
  if (!page) notFound();
  return (
    <>
      <PageHeading {...page} />
      <div className="p-10">
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <h2 className="font-medium">{page.title} workspace</h2>
          <p className="mt-2 text-sm text-slate-500">
            This protected route is ready for its server-backed workflow.
          </p>
        </section>
      </div>
    </>
  );
}
