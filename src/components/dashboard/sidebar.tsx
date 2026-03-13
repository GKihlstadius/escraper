'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard, Package, Bell, Database,
  LogOut, RefreshCw, X, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Produkter', icon: Package },
  { href: '/alerts', label: 'Larm', icon: Bell },
  { href: '/database', label: 'Databas', icon: Database },
];

interface SidebarProps {
  userEmail: string;
  isOpen?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}

export function Sidebar({ userEmail, isOpen, collapsed, onClose, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleScrape() {
    setScraping(true);
    setScrapeStatus('Hämtar butiker...');
    try {
      const supabase = createClient();
      const { data: competitors } = await supabase
        .from('competitors')
        .select('id, name')
        .eq('is_active', true);

      const total = (competitors || []).length;
      setScrapeProgress({ current: 0, total });

      for (let i = 0; i < (competitors || []).length; i++) {
        const comp = competitors![i];
        let offset = 0;
        let totalScraped = 0;
        let pass = 1;

        // Loop until all URLs are processed for this competitor
        while (true) {
          setScrapeStatus(`${comp.name}${pass > 1 ? ` (omgång ${pass})` : ''}`);
          setScrapeProgress({ current: i + 1, total });
          try {
            const res = await fetch('/api/scrape', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitorId: comp.id, offset }),
            });
            const data = await res.json().catch(() => null);
            if (data?.productsScraped !== undefined) {
              totalScraped += data.productsScraped;
              const urlInfo = data.totalUrls ? ` (${data.urlsProcessed}/${data.totalUrls} URLer)` : '';
              setScrapeStatus(`${comp.name} ✓ ${totalScraped} produkter${urlInfo}`);
            }

            // Continue if there are more URLs to process
            if (data?.hasMore && data?.urlsProcessed) {
              offset = data.urlsProcessed;
              pass++;
              continue;
            }
          } catch (err) {
            setScrapeStatus(`${comp.name} — fel`);
            console.error(`Scrape failed for ${comp.name}:`, err);
          }
          break;
        }
      }

      setScrapeStatus('Genererar rekommendationer...');
      await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateRecs: true }),
      }).catch(() => {});

      setScrapeStatus('Klar! Laddar om...');
      window.location.reload();
    } catch (err) {
      console.error('Scrape failed:', err);
      setScrapeStatus('Fel vid scraping');
      setScraping(false);
    }
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-white border-r border-[#E5E7EB] transition-all duration-300 z-50 shadow-[0_10px_30px_rgba(0,0,0,0.08)] flex flex-col",
          collapsed ? "w-[72px]" : "w-64",
          !isOpen && "max-lg:-translate-x-full lg:translate-x-0",
          isOpen && "max-lg:translate-x-0"
        )}
      >
        <button onClick={onClose} className="lg:hidden absolute top-4 right-4 p-2 text-[#6B7280] hover:text-[#111111]">
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className={cn("flex items-center gap-3 border-b border-[#E5E7EB] flex-shrink-0", collapsed ? "p-4 justify-center" : "p-6")}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">E</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-semibold text-[#111111] tracking-tight truncate">E-scraper</h1>
              <p className="text-xs text-[#6B7280]">Prisövervakning</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 overflow-y-auto space-y-1", collapsed ? "p-2" : "p-4")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl transition-all duration-200",
                  collapsed ? "px-0 py-3 justify-center" : "px-4 py-3",
                  isActive
                    ? "bg-[#7C3AED]/10 text-[#7C3AED]"
                    : "text-[#6B7280] hover:bg-[#F5F5F4] hover:text-[#111111]"
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "stroke-[2.5px]")} />
                {!collapsed && (
                  <span className={cn("font-medium", isActive && "font-semibold")}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Scrape status */}
        {scraping && !collapsed && (
          <div className="flex-shrink-0 border-t border-[#E5E7EB] px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-[#7C3AED] animate-spin flex-shrink-0" />
              <span className="text-xs font-medium text-[#7C3AED] truncate">{scrapeStatus}</span>
            </div>
            {scrapeProgress.total > 0 && (
              <>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-[#F5F5F4]">
                  <div
                    className="bg-[#7C3AED] rounded-full transition-all duration-500"
                    style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#6B7280]">Butik {scrapeProgress.current} av {scrapeProgress.total}</p>
              </>
            )}
          </div>
        )}

        {/* Bottom */}
        <div className={cn("flex-shrink-0 border-t border-[#E5E7EB] space-y-3", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <>
              <button
                onClick={handleScrape}
                disabled={scraping}
                title={scraping ? scrapeStatus : "Scrapa nu"}
                className={cn(
                  "w-full flex items-center justify-center p-3 rounded-xl border transition-colors disabled:opacity-50",
                  scraping ? "border-[#7C3AED] bg-[#7C3AED]/5 text-[#7C3AED]" : "border-[#7C3AED]/30 text-[#7C3AED] hover:bg-[#7C3AED]/5"
                )}
              >
                <RefreshCw className={cn("h-4 w-4", scraping && "animate-spin")} />
              </button>
              <button
                onClick={handleLogout}
                title="Logga ut"
                className="w-full flex items-center justify-center p-3 rounded-xl text-[#6B7280] hover:bg-red-50 hover:text-red-600 transition-all"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B7280] truncate">{userEmail}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleScrape}
                    disabled={scraping}
                    title="Manuell scraping"
                    className="p-2 rounded-xl text-[#6B7280] hover:bg-[#7C3AED]/5 hover:text-[#7C3AED] transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", scraping && "animate-spin")} />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-xl text-[#6B7280] hover:bg-red-50 hover:text-red-600 transition-all"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center py-3 border-t border-[#E5E7EB] text-[#6B7280] hover:text-[#111111] hover:bg-[#F5F5F4] transition-colors"
          title={collapsed ? "Expandera" : "Minimera"}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </aside>
    </>
  );
}
