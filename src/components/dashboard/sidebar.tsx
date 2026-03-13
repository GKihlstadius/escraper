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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleScrape() {
    setScraping(true);
    try {
      const res = await fetch('/api/scrape', { method: 'POST', body: '{}' });
      const data = await res.json().catch(() => null);
      // Force full page reload to show updated data
      window.location.reload();
    } catch (err) {
      console.error('Scrape failed:', err);
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

        {/* Bottom */}
        <div className={cn("flex-shrink-0 border-t border-[#E5E7EB] space-y-3", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <>
              <button
                onClick={handleScrape}
                disabled={scraping}
                title="Scrapa nu"
                className="w-full flex items-center justify-center p-3 rounded-xl border border-[#7C3AED]/30 text-[#7C3AED] hover:bg-[#7C3AED]/5 transition-colors disabled:opacity-50"
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
