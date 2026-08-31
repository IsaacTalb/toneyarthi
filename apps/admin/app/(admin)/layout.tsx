import { Sidebar } from '../../components/sidebar';
import { requireSession } from '../../lib/session';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={session.email} />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
