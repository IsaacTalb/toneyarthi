import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Radio,
  TriangleAlert,
} from 'lucide-react';
import { PageHeading } from '../../components/page-heading';
import { adminApi } from '../../lib/admin-api';

const queue = [
  {
    title: 'Election commission releases updated guidance',
    source: 'The Hindu',
    age: '8m',
    state: 'Ready for review',
  },
  {
    title: 'Markets close higher after policy announcement',
    source: 'Reuters',
    age: '21m',
    state: 'Verifying',
  },
  {
    title: 'Regional rail expansion receives cabinet approval',
    source: 'Indian Express',
    age: '34m',
    state: 'Audio pending',
  },
];

export default async function DashboardPage() {
  const { metrics } = await adminApi<{
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
  }>('/v1/admin/processing');
  const stats = [
    { label: 'Queued', value: metrics.queued, detail: 'Waiting for a worker' },
    { label: 'Processing', value: metrics.processing, detail: 'Active jobs' },
    { label: 'Failed', value: metrics.failed, detail: 'Terminal jobs' },
    {
      label: 'Review required',
      value: metrics.reviewRequired,
      detail: 'Editorial attention',
    },
    {
      label: 'Published today',
      value: metrics.publishedToday,
      detail: 'UTC calendar day',
    },
    {
      label: 'Source failures',
      value: metrics.sourceFailures,
      detail: 'Sources reporting errors',
    },
    {
      label: 'Gemini failures',
      value: metrics.geminiFailures,
      detail: 'AI terminal failures',
    },
    {
      label: 'TTS failures',
      value: metrics.ttsFailures,
      detail: 'Audio terminal failures',
    },
  ];
  return (
    <>
      <PageHeading
        title="Dashboard"
        description="A quick view of today’s editorial pipeline."
        action={
          <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Systems operational
          </span>
        }
      />
      <div className="space-y-8 p-10">
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {stat.value.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-500">{stat.detail}</p>
            </article>
          ))}
        </section>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold">Review queue</h2>
                <p className="text-xs text-slate-500">
                  Stories that need editorial attention
                </p>
              </div>
              <a
                href="/review"
                className="flex items-center gap-1 text-sm font-medium"
              >
                View all <ArrowUpRight size={14} />
              </a>
            </div>
            <div className="divide-y divide-slate-100">
              {queue.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                    <Clock3 size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.source} · {item.age} ago
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {item.state}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Pipeline health</h2>
            <p className="mt-1 text-xs text-slate-500">Past 24 hours</p>
            <div className="mt-6 space-y-5">
              <Health
                icon={<Radio size={16} />}
                label="Ingestion"
                value="Healthy"
                tone="green"
              />
              <Health
                icon={<CheckCircle2 size={16} />}
                label="AI processing"
                value="98.4%"
                tone="green"
              />
              <Health
                icon={<CheckCircle2 size={16} />}
                label="Audio generation"
                value="96.1%"
                tone="green"
              />
              <Health
                icon={<TriangleAlert size={16} />}
                label="Failed jobs"
                value={String(metrics.failed)}
                tone="amber"
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Health({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'green' | 'amber';
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid size-8 place-items-center rounded-lg ${tone === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
