import {
  AlertTriangle,
  Bot,
  Headphones,
  Newspaper,
  RotateCcw,
  ServerCrash,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeading } from '../../../components/page-heading';
import { adminApi } from '../../../lib/admin-api';
import { retryJob } from './actions';

interface Job {
  id: string;
  article: string;
  articleId: string | null;
  clusterId: string | null;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  retryable: boolean;
}
interface Data {
  metrics: Record<
    | 'queued'
    | 'processing'
    | 'failed'
    | 'reviewRequired'
    | 'publishedToday'
    | 'sourceFailures'
    | 'geminiFailures'
    | 'ttsFailures',
    number
  >;
  items: Job[];
  page: number;
  hasMore: boolean;
}
const statuses = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'FAILED_AI',
  'FAILED_TTS',
];
const types = [
  'ingest',
  'translate',
  'summarize',
  'cluster',
  'extract',
  'write',
  'audio',
];
const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';

export default async function ProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>;
}) {
  const query = await searchParams;
  const parameters = new URLSearchParams();
  if (query.status) parameters.set('status', query.status);
  if (query.type) parameters.set('type', query.type);
  if (query.page) parameters.set('page', query.page);
  const pageHref = (page: number) => {
    const next = new URLSearchParams(parameters);
    next.set('page', String(page));
    return `/processing?${next}`;
  };
  const data = await adminApi<Data>(`/v1/admin/processing?${parameters}`);
  const cards = [
    ['Queued', data.metrics.queued, Newspaper],
    ['Processing', data.metrics.processing, Bot],
    ['Failed', data.metrics.failed, AlertTriangle],
    ['Review required', data.metrics.reviewRequired, Newspaper],
    ['Published today', data.metrics.publishedToday, Newspaper],
    ['Source failures', data.metrics.sourceFailures, ServerCrash],
    ['Gemini failures', data.metrics.geminiFailures, Bot],
    ['TTS failures', data.metrics.ttsFailures, Headphones],
  ] as const;
  return (
    <>
      <PageHeading
        title="Processing"
        description="Monitor pipeline jobs, diagnose sanitized failures, and safely retry terminal work."
      />
      <div className="space-y-6 p-10">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, Icon]) => (
            <article
              key={label}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Icon size={18} />
              </span>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            </article>
          ))}
        </section>
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
          action="/processing"
        >
          <label className="text-xs font-medium text-slate-600">
            Status
            <select
              name="status"
              defaultValue={query.status ?? ''}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {statuses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Type
            <select
              name="type"
              defaultValue={query.type ?? ''}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Filter
          </button>
          <Link href="/processing" className="px-3 py-2 text-sm text-slate-500">
            Clear
          </Link>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {[
                    'Article',
                    'Type / status',
                    'Attempts',
                    'Last sanitized error',
                    'Timestamps',
                    '',
                  ].map((x) => (
                    <th key={x} className="px-4 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="max-w-xs px-4 py-4">
                      <p className="font-medium">{job.article}</p>
                      <code className="text-[11px] text-slate-400">
                        {job.id}
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-medium">{job.type}</span>
                      <span className="mt-1 block w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 tabular-nums">
                      {job.attempts} / {job.maxAttempts}
                    </td>
                    <td className="max-w-sm px-4 py-4 text-xs text-red-700">
                      <span title={job.error ?? undefined}>
                        {job.error ?? (
                          <span className="text-slate-400">None</span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                      <div>Created {when(job.createdAt)}</div>
                      <div>Started {when(job.startedAt)}</div>
                      <div>Finished {when(job.completedAt)}</div>
                      <div>Updated {when(job.updatedAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      {job.retryable && (
                        <form action={retryJob}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                            <RotateCcw size={13} />
                            Retry
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <p className="p-10 text-center text-sm text-slate-500">
              No jobs match these filters.
            </p>
          )}
        </section>
        <nav className="flex justify-end gap-2 text-sm">
          {data.page > 1 && (
            <Link
              className="rounded border px-3 py-1.5"
              href={pageHref(data.page - 1)}
            >
              Previous
            </Link>
          )}
          {data.hasMore && (
            <Link
              className="rounded border px-3 py-1.5"
              href={pageHref(data.page + 1)}
            >
              Next
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}
