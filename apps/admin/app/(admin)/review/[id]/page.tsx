import { notFound } from 'next/navigation';
import { adminApi } from '../../../../lib/admin-api';
import { ReviewEditor, type ReviewDetail } from './review-editor';

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let article: ReviewDetail;
  try {
    article = await adminApi(
      `/v1/admin/story-clusters/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Article not found')
      notFound();
    return (
      <div
        className="m-10 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
        role="alert"
      >
        <h1 className="font-semibold">Review could not be loaded</h1>
        <p className="mt-2 text-sm">
          {error instanceof Error
            ? error.message
            : 'The backend request failed.'}
        </p>
      </div>
    );
  }
  return <ReviewEditor initial={article} />;
}
