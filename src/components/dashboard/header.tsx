'use client';

import { useState } from 'react';
import { Search, Bell, User, ChevronDown, Menu as MenuIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  title: string;
  subtitle?: string;
  userEmail: string;
  unreadAlerts?: number;
  onMenuClick?: () => void;
}

export function Header({ title, subtitle, userEmail, unreadAlerts = 0, onMenuClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bg-white border-b border-[#E5E7EB] px-4 md:px-8 py-4 md:py-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-[#F5F5F4] rounded-lg"
          >
            <MenuIcon className="w-6 h-6 text-[#111111]" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-[#111111] tracking-tight">{title}</h1>
            {subtitle && <p className="text-[#6B7280] mt-0.5 md:mt-1 font-light text-sm md:text-base">{subtitle}</p>}
          </div>
        </div>

        <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
            <Input
              type="text"
              placeholder="Sök produkter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full bg-[#F5F5F4] border border-[#E5E7EB] rounded-xl focus:bg-white transition-colors"
            />
          </div>
        </form>

        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-[#F5F5F4] rounded-xl"
            onClick={() => router.push('/alerts')}
          >
            <Bell className="w-5 h-5 text-[#6B7280]" />
            {unreadAlerts > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
                {unreadAlerts}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-[#F5F5F4] rounded-xl px-3 py-2 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-[#111111]">Admin</p>
                <p className="text-xs text-[#6B7280] font-light">{userEmail}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-[#6B7280]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white border border-[#E5E7EB]">
              <DropdownMenuItem className="text-red-600" onClick={handleLogout}>
                Logga ut
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
