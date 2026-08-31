import { AlertCircle, CheckCircle2, Database, Radio } from 'lucide-react';
import { PageHeading } from '../../../components/page-heading';
import { adminApi } from '../../../lib/admin-api';
import { updateSource } from './actions';

interface Source {
  id: string;
  slug: string;
  name: string;
  feedUrl: string;
  adapterType: string;
  isActive: boolean;
  priority: number;
  lastSuccess: string | null;
  lastError: string | null;
  articleCount: number;
}

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Never';
}

export default async function SourcesPage() {
  const { items } = await adminApi<{ items: Source[] }>('/v1/admin/sources');
  const active = items.filter((source) => source.isActive).length;
  return (
    <>
      <PageHeading
        title="Sources"
        description="Configure registered feeds and monitor collection reliability."
      />
      <div className="space-y-6 p-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<Radio size={18} />}
            label="Enabled"
            value={`${active} / ${items.length}`}
          />
          <Stat
            icon={<Database size={18} />}
            label="Articles collected"
            value={items
              .reduce((sum, source) => sum + source.articleCount, 0)
              .toLocaleString()}
          />
          <Stat
            icon={<AlertCircle size={18} />}
            label="Sources with errors"
            value={String(items.filter((source) => source.lastError).length)}
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Feed</th>
                  <th className="px-5 py-3">Last success</th>
                  <th className="px-5 py-3">Last error</th>
                  <th className="px-5 py-3 text-right">Collected</th>
                  <th className="px-5 py-3">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((source) => (
                  <tr key={source.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {source.name}
                      </div>
                      <code className="text-xs text-slate-500">
                        {source.slug}
                      </code>
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      <span className="mb-1 inline-flex rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium uppercase text-indigo-700">
                        {source.adapterType}
                      </span>
                      <a
                        className="block truncate text-xs text-slate-500 hover:text-indigo-600"
                        href={source.feedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.feedUrl}
                      </a>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {source.lastSuccess ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2
                            size={15}
                            className="text-emerald-500"
                          />
                          {date(source.lastSuccess)}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      {source.lastError ? (
                        <span
                          className="text-xs text-red-700"
                          title={source.lastError}
                        >
                          {source.lastError}
                        </span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {source.articleCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      <form
                        action={updateSource}
                        className="flex items-center gap-3"
                      >
                        <input type="hidden" name="slug" value={source.slug} />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            className="h-4 w-4 accent-indigo-600"
                            type="checkbox"
                            name="isActive"
                            defaultChecked={source.isActive}
                          />{' '}
                          Enabled
                        </label>
                        <label className="text-xs text-slate-500">
                          Priority{' '}
                          <input
                            className="ml-1 w-16 rounded border border-slate-300 px-2 py-1 text-slate-900"
                            type="number"
                            name="priority"
                            min="0"
                            max="1000"
                            defaultValue={source.priority}
                            required
                          />
                        </label>
                        <button
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                          type="submit"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
