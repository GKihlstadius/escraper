import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  return (
    <DashboardShell userEmail={user.email || ''} unreadAlerts={count || 0}>
      {children}
    </DashboardShell>
  );
}
