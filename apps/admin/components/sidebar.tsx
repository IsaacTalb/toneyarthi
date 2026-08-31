'use client';

import {
  Archive,
  BookOpen,
  Boxes,
  CircleGauge,
  FileCheck2,
  FileClock,
  FolderTree,
  ListMusic,
  LogOut,
  Newspaper,
  Settings,
  Waypoints,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '../app/login/actions';

const routes = [
  { label: 'Dashboard', href: '/', icon: CircleGauge },
  { label: 'Articles', href: '/articles', icon: Newspaper },
  { label: 'Candidates', href: '/candidates', icon: FileClock },
  { label: 'Review', href: '/review', icon: FileCheck2 },
  { label: 'Published', href: '/published', icon: Archive },
  { label: 'Sources', href: '/sources', icon: Waypoints },
  { label: 'Categories', href: '/categories', icon: FolderTree },
  { label: 'Playlists', href: '/playlists', icon: ListMusic },
  { label: 'Processing', href: '/processing', icon: Boxes },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5">
      <div className="flex items-center gap-3 px-3 pb-6">
        <span className="grid size-9 place-items-center rounded-lg bg-slate-950 text-white">
          <BookOpen size={18} />
        </span>
        <div>
          <div className="font-semibold tracking-tight">Tone Yarthi</div>
          <div className="text-xs text-slate-500">Editorial admin</div>
        </div>
      </div>
      <nav className="space-y-1" aria-label="Admin navigation">
        {routes.map(({ label, href, icon: Icon }) => {
          const active =
            href === '/' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-slate-200 px-3 pt-4">
        <div className="truncate text-xs text-slate-500">Signed in as</div>
        <div className="truncate text-sm font-medium">{email}</div>
        <form action={logout}>
          <button className="mt-3 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950">
            <LogOut size={15} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
