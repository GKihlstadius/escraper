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
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-[#7C3AED]/10 via-transparent to-[#EC4899]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-[#3B82F6]/10 via-transparent to-[#10B981]/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white mb-4 shadow-xl shadow-[#7C3AED]/30">
            <span className="text-2xl font-bold">E</span>
          </div>
          <h1 className="text-3xl font-bold text-[#111111] tracking-tight">
            E-<span className="bg-gradient-to-r from-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent">SCRAPER</span>
          </h1>
          <p className="text-[#6B7280] mt-2 font-light">Logga in till din dashboard</p>
        </div>

        <Card className="shadow-xl shadow-[#111111]/5 border-[#E5E7EB]">
          <CardHeader>
            <CardTitle className="font-semibold tracking-tight text-[#111111]">Välkommen tillbaka</CardTitle>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-[#111111]">E-post</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 border-[#E5E7EB] focus:ring-[#7C3AED] focus:border-[#7C3AED]"
                  placeholder="din@email.se"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#111111]">Lösenord</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 pr-10 border-[#E5E7EB] focus:ring-[#7C3AED] focus:border-[#7C3AED]"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111111] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full bg-[#111111] hover:bg-[#333333] disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Loggar in...' : 'Logga in'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
