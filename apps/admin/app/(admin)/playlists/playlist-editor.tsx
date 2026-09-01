'use client';

import { useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { PlaylistArticle, savePlaylist, searchArticles } from './actions';

export interface PlaylistValue {
  id?: string;
  titleMy: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  scheduleType: string;
  articles: PlaylistArticle[];
}

export function PlaylistEditor({ value }: { value: PlaylistValue }) {
  const [members, setMembers] = useState(value.articles);
  const [results, setResults] = useState<PlaylistArticle[]>([]);
  const [query, setQuery] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const move = (index: number, delta: number) =>
    setMembers((current) => {
      const next = [...current],
        target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const submit = (form: FormData) =>
    startTransition(async () => {
      await savePlaylist({
        id: value.id,
        titleMy: String(form.get('titleMy') ?? ''),
        slug: String(form.get('slug') ?? ''),
        description: String(form.get('description') ?? ''),
        imageUrl: String(form.get('imageUrl') ?? ''),
        isActive: form.get('isActive') === 'on',
        scheduleType: String(form.get('scheduleType') ?? ''),
        articleIds: members.map(({ id }) => id),
      });
    });
  return (
    <form action={submit} className="space-y-8">
      <section className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <Field label="Burmese name">
          <input
            name="titleMy"
            required
            maxLength={200}
            defaultValue={value.titleMy}
            className="input"
            lang="my"
          />
        </Field>
        <Field label="Slug">
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            defaultValue={value.slug}
            className="input"
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            maxLength={2000}
            defaultValue={value.description ?? ''}
            className="input min-h-28"
          />
        </Field>
        <div className="space-y-5">
          <Field label="Image URL">
            <input
              name="imageUrl"
              type="url"
              pattern="https://.*"
              defaultValue={value.imageUrl ?? ''}
              className="input"
            />
          </Field>
          <Field label="Schedule type">
            <select
              name="scheduleType"
              defaultValue={value.scheduleType}
              className="input"
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={value.isActive}
              className="size-4 accent-indigo-600"
            />{' '}
            Active and public
          </label>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Articles</h2>
        <p className="mt-1 text-sm text-slate-500">
          Only published articles with audio are available. Drag rows, or use
          the move buttons.
        </p>
        <div className="mt-4 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search eligible articles</span>
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={17}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-9"
              placeholder="Search by English or Burmese title"
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() =>
              startTransition(async () =>
                setResults((await searchArticles(query)).items),
              )
            }
          >
            Search
          </button>
        </div>
        {results.length > 0 && (
          <ul
            className="mt-2 max-h-56 overflow-auto rounded-lg border"
            aria-label="Article search results"
          >
            {results.map((article) => {
              const added = members.some(({ id }) => id === article.id);
              return (
                <li
                  key={article.id}
                  className="flex items-center justify-between gap-4 border-b p-3 last:border-0"
                >
                  <span className="min-w-0 truncate text-sm">
                    {article.titleMy || article.title}
                  </span>
                  <button
                    type="button"
                    disabled={added}
                    className="button-secondary"
                    onClick={() => setMembers((items) => [...items, article])}
                  >
                    <Plus size={15} />
                    {added ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ol className="mt-5 space-y-2" aria-label="Ordered playlist articles">
          {members.map((article, index) => (
            <li
              key={article.id}
              draggable
              onDragStart={() => setDragged(article.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = members.findIndex(({ id }) => id === dragged);
                if (from >= 0 && from !== index)
                  setMembers((items) => {
                    const next = [...items],
                      [item] = next.splice(from, 1);
                    next.splice(index, 0, item);
                    return next;
                  });
                setDragged(null);
              }}
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
            >
              <GripVertical
                size={18}
                className="cursor-grab text-slate-400"
                aria-hidden="true"
              />
              <span className="w-6 text-sm tabular-nums text-slate-400">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {article.titleMy || article.title}
              </span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="icon-button"
                aria-label={`Move ${article.titleMy || article.title} up`}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === members.length - 1}
                className="icon-button"
                aria-label={`Move ${article.titleMy || article.title} down`}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setMembers((items) =>
                    items.filter(({ id }) => id !== article.id),
                  )
                }
                className="icon-button text-red-600"
                aria-label={`Remove ${article.titleMy || article.title}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex justify-end">
        <button disabled={pending} className="button px-5 py-2.5">
          {pending ? 'Saving…' : 'Save playlist'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
