'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Fel e-post eller lösenord');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F4] p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-[#7C3AED]/8 via-transparent to-[#EC4899]/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-[#3B82F6]/6 via-transparent to-[#10B981]/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white mb-5 shadow-lg shadow-[#7C3AED]/25">
            <span className="text-xl font-bold">E</span>
          </div>
          <h1 className="text-2xl font-bold text-[#111111] tracking-tight">
            E-<span className="bg-gradient-to-r from-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent">SCRAPER</span>
          </h1>
          <p className="text-zinc-400 mt-1.5 text-sm">Prisövervakning & konkurrentanalys</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-black/5 border border-zinc-100 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-6">Logga in</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1.5 block">E-post</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl border-zinc-200 bg-zinc-50/50 focus:bg-white focus:border-[#7C3AED] transition-colors text-sm"
                placeholder="din@email.se"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1.5 block">Lösenord</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10 rounded-xl border-zinc-200 bg-zinc-50/50 focus:bg-white focus:border-[#7C3AED] transition-colors text-sm"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-white font-medium text-sm shadow-md shadow-[#7C3AED]/25 hover:shadow-lg hover:shadow-[#7C3AED]/30 hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all"
            >
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-6">
          E-Scraper Prisövervakning
        </p>
      </div>
    </div>
  );
}
