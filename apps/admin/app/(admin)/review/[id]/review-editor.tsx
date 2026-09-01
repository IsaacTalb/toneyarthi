'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Save,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

export interface ReviewDetail {
  id: string;
  title: string;
  state: string;
  updatedAt: string;
  editorialRisk: 'standard' | 'high';
  editorialConfidence: 'high' | 'medium' | 'low';
  riskTopics: string[];
  riskReasons: string[];
  draft: {
    titleMm: string;
    summaryMm: string;
    contentMm: string;
    audioScriptMm: string;
  };
  sources: {
    name: string;
    title: string;
    url: string;
    publishedAt: string | null;
  }[];
  facts: string[];
  attributedClaims: unknown[];
  allegations: unknown[];
  predictions: unknown[];
  opinions: unknown[];
  uncertainties: unknown[];
  sourceDisagreements: unknown[];
  verification: {
    passed: boolean | null;
    attempt: number;
    errors: string[];
    checkedAt: string;
  } | null;
  audio: {
    url: string;
    durationSeconds: number;
    narrator: string | null;
  } | null;
  audit: {
    action: string;
    actor: string;
    createdAt: string;
    changedFields: string[];
    details: Record<string, unknown>;
  }[];
}

const limits = {
  titleMm: 180,
  summaryMm: 600,
  contentMm: 20000,
  audioScriptMm: 12000,
};

export function ReviewEditor({ initial }: { initial: ReviewDetail }) {
  const [draft, setDraft] = useState(initial.draft);
  const [saved, setSaved] = useState(initial.draft);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<{
    tone: 'good' | 'bad';
    text: string;
  }>();
  const changed = useMemo(
    () =>
      Object.keys(draft).filter(
        (key) =>
          draft[key as keyof typeof draft] !== saved[key as keyof typeof saved],
      ),
    [draft, saved],
  );
  const errors = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [
      key,
      !value.trim()
        ? 'Required'
        : value.length > limits[key as keyof typeof limits]
          ? `Maximum ${limits[key as keyof typeof limits].toLocaleString()} characters`
          : '',
    ]),
  );
  const valid = Object.values(errors).every((value) => !value);

  async function request(
    action: string,
    body: Record<string, unknown>,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setNotice(undefined);
    try {
      const response = await fetch(
        `/api/review/${encodeURIComponent(initial.id)}`,
        {
          method: action === 'save' ? 'PATCH' : 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify(action === 'save' ? body : { action, ...body }),
        },
      );
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message ?? 'The backend rejected the request.');
      if (action === 'save') setSaved({ ...draft });
      setNotice({
        tone: 'good',
        text:
          action === 'save'
            ? 'Draft saved and changes recorded.'
            : 'Action accepted. The latest state will appear after refresh.',
      });
    } catch (error) {
      setNotice({
        tone: 'bad',
        text:
          error instanceof Error
            ? error.message
            : 'Request failed. No local state was changed.',
      });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="min-w-0">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/review"
            aria-label="Back to review queue"
            className="rounded-lg border p-2 hover:bg-slate-50"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">
                {initial.title}
              </h1>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                {initial.state.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Updated {new Date(initial.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!!busy || !changed.length || !valid}
            onClick={() => request('save', draft)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40"
          >
            <Save size={16} /> Save draft
          </button>
          <button
            disabled={!!busy || changed.length > 0 || initial.state !== 'READY'}
            onClick={() =>
              request(
                'publish',
                { approved: true },
                'Publish this story to all readers? This cannot be treated as a preview.',
              )
            }
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Publish
          </button>
        </div>
      </header>
      <main className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 p-8">
        <div className="space-y-6">
          {notice && (
            <div
              role={notice.tone === 'bad' ? 'alert' : 'status'}
              className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === 'bad' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
            >
              {notice.text}
            </div>
          )}
          <Card
            title="Burmese article draft"
            subtitle="Required fields are validated before saving."
          >
            <Field
              label="Headline"
              name="titleMm"
              value={draft.titleMm}
              error={errors.titleMm}
              onChange={(value) => setDraft({ ...draft, titleMm: value })}
            />
            <Field
              label="Summary"
              name="summaryMm"
              value={draft.summaryMm}
              error={errors.summaryMm}
              multiline
              onChange={(value) => setDraft({ ...draft, summaryMm: value })}
            />
            <Field
              label="Article"
              name="contentMm"
              value={draft.contentMm}
              error={errors.contentMm}
              rows={12}
              onChange={(value) => setDraft({ ...draft, contentMm: value })}
            />
          </Card>
          <Card
            title="Audio script"
            subtitle="Edit spoken copy separately from the display article."
          >
            <Field
              label="Narration"
              name="audioScriptMm"
              value={draft.audioScriptMm}
              error={errors.audioScriptMm}
              rows={8}
              onChange={(value) => setDraft({ ...draft, audioScriptMm: value })}
            />
            {initial.audio ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Volume2 size={16} /> Generated audio ·{' '}
                  {Math.round(initial.audio.durationSeconds)} sec
                </div>
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={initial.audio.url}
                />
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                No generated audio is available.
              </p>
            )}
          </Card>
          <Card
            title="Evidence ledger"
            subtitle="Categories remain distinct; disagreements are never resolved silently."
          >
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Risk: <strong>{initial.editorialRisk}</strong> · Confidence:{' '}
              <strong>{initial.editorialConfidence}</strong>
              {initial.riskTopics.length > 0 &&
                ` · ${initial.riskTopics.join(', ')}`}
            </p>
            <ul className="space-y-3">
              {initial.facts.map((fact, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-xs">
                    {index + 1}
                  </span>
                  {fact}
                </li>
              ))}
            </ul>
            {(
              [
                ['Attributed claims', initial.attributedClaims],
                ['Allegations', initial.allegations],
                ['Predictions', initial.predictions],
                ['Opinions', initial.opinions],
                ['Uncertainty', initial.uncertainties],
                ['Source disagreements', initial.sourceDisagreements],
              ] as const
            ).map(
              ([label, items]) =>
                items.length > 0 && (
                  <div key={label} className="mt-5">
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">
                      {JSON.stringify(items, null, 2)}
                    </pre>
                  </div>
                ),
            )}
          </Card>
        </div>
        <aside className="space-y-6">
          <Card title="Verification result">
            {initial.verification ? (
              <div
                className={
                  initial.verification.passed
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }
              >
                <div className="flex items-center gap-2 font-medium">
                  {initial.verification.passed ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <XCircle size={18} />
                  )}{' '}
                  {initial.verification.passed
                    ? 'Verification passed'
                    : 'Needs attention'}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Attempt {initial.verification.attempt} ·{' '}
                  {new Date(initial.verification.checkedAt).toLocaleString()}
                </p>
                {initial.verification.errors.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {initial.verification.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Verification has not completed.
              </p>
            )}
          </Card>
          <Card title="Sources">
            {' '}
            <div className="space-y-3">
              {initial.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border p-3 hover:border-slate-400"
                >
                  <div className="flex justify-between text-sm font-medium">
                    {source.name}
                    <ExternalLink size={14} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {source.title}
                  </p>
                  {source.publishedAt && (
                    <p className="mt-1 text-xs text-slate-500">
                      Originally published{' '}
                      {new Date(source.publishedAt).toLocaleString()}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </Card>
          <Card
            title="Actions"
            subtitle="AI actions may incur cost and are never optimistic."
          >
            <div className="space-y-2">
              <Action
                icon={<RotateCcw size={15} />}
                label="Regenerate article"
                disabled={!!busy}
                onClick={() =>
                  request(
                    'regenerate-article',
                    {},
                    'Regenerate the full article? This incurs AI cost and replaces the current pipeline output.',
                  )
                }
              />
              <Action
                icon={<Sparkles size={15} />}
                label="Re-humanize draft"
                disabled={!!busy}
                onClick={() =>
                  request(
                    'rehumanize',
                    {},
                    'Run humanization again? This incurs AI cost.',
                  )
                }
              />
              <Action
                icon={<Volume2 size={15} />}
                label="Regenerate audio"
                disabled={!!busy}
                onClick={() =>
                  request(
                    'regenerate-audio',
                    {},
                    'Regenerate audio? This incurs TTS cost and supersedes the current audio.',
                  )
                }
              />
              <Action
                icon={<XCircle size={15} />}
                label="Reject story"
                danger
                disabled={!!busy}
                onClick={() => {
                  const reason = window.prompt('Rejection reason (required)');
                  if (reason?.trim())
                    request(
                      'reject',
                      { reason: reason.trim() },
                      'Reject this story and return it for rework?',
                    );
                }}
              />
            </div>
          </Card>
          <Card title="Audit log">
            <ol className="space-y-4">
              {initial.audit.map((item, index) => (
                <li
                  key={`${item.createdAt}-${index}`}
                  className="border-l-2 border-slate-200 pl-3"
                >
                  <p className="text-sm font-medium">
                    {item.action.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.actor} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {item.changedFields.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Changed: {item.changedFields.join(', ')}
                    </p>
                  )}
                  {Object.keys(item.details).length > 0 && (
                    <pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs text-slate-500">
                      {JSON.stringify(item.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </main>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
function Field({
  label,
  name,
  value,
  error,
  onChange,
  multiline,
  rows,
}: {
  label: string;
  name: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  const className = `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${error ? 'border-red-300 focus:ring-red-100' : 'border-slate-300 focus:border-slate-500 focus:ring-slate-100'}`;
  return (
    <label className="mb-4 block text-sm font-medium">
      {label}
      {multiline || rows ? (
        <textarea
          name={name}
          value={value}
          rows={rows ?? 3}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      ) : (
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
      <span
        className={`mt-1 block text-xs ${error ? 'text-red-600' : 'text-slate-400'}`}
      >
        {error || `${value.length.toLocaleString()} characters`}
      </span>
    </label>
  );
}
function Action({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40 ${danger ? 'border-red-200 text-red-700 hover:bg-red-50' : 'hover:bg-slate-50'}`}
    >
      {icon}
      {label}
    </button>
  );
}
