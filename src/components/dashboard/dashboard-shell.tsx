'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { AIPanel } from './ai-panel';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Översikt av prisövervakning' },
  '/products': { title: 'Produkter', subtitle: 'Hantera produkter och priser' },
  '/alerts': { title: 'Larm', subtitle: 'Prisförändringar och notifikationer' },
  '/database': { title: 'Databas', subtitle: 'Dagliga prisrapporter' },
};

export function DashboardShell({
  children,
  userEmail,
  unreadAlerts,
}: {
  children: React.ReactNode;
  userEmail: string;
  unreadAlerts: number;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [aiState, setAiState] = useState<'closed' | 'minimized' | 'open'>('closed');
  const pathname = usePathname();

  const pageInfo = PAGE_TITLES[pathname] || { title: 'E-Scraper' };
  const aiOpen = aiState === 'open';

  return (
    <div className="min-h-screen bg-[#F5F5F4]">
      <Sidebar
        userEmail={userEmail}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content area */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-300",
          sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64"
        )}
      >
        <Header
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          userEmail={userEmail}
          unreadAlerts={unreadAlerts}
          onMenuClick={() => setSidebarOpen(true)}
          showSearch={pathname === '/products'}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6 max-w-7xl mx-auto">
              {children}
            </div>
          </main>

          {/* AI Panel — inline on desktop when open */}
          {aiOpen && (
            <div className="hidden sm:flex w-[420px] flex-shrink-0 h-[calc(100vh-73px)]">
              <AIPanel panelState={aiState} onStateChange={setAiState} />
            </div>
          )}
        </div>
      </div>

      {/* Floating button / minimized bar when not open */}
      {!aiOpen && (
        <AIPanel panelState={aiState} onStateChange={setAiState} />
      )}

      {/* Mobile AI overlay */}
      {aiOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-white">
          <AIPanel panelState={aiState} onStateChange={setAiState} />
        </div>
      )}
    </div>
  );
}
