'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  ArrowRight, Database, ShoppingCart, BarChart3, TrendingUp,
  Globe, Star, Users, Menu,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Link from 'next/link';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Så fungerar det', href: '#how-it-works' },
    { label: 'Funktioner', href: '#use-cases' },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#111111] overflow-x-hidden">
      {/* NAVBAR */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-48px)] max-w-5xl">
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-between h-16 px-6 bg-white/80 backdrop-blur-xl rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-[#E5E7EB]"
        >
          <span className="text-lg font-bold tracking-tight">
            E-<span className="gradient-text">SCRAPER</span>
          </span>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="nav-link">{link.label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-[#6B7280] hover:text-[#111111] transition-colors">
              Logga in
            </Link>
            <Link href="/login" className="px-5 py-2 text-sm font-medium bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-full transition-all">
              Kom igång
            </Link>
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger className="md:hidden p-2">
              <Menu className="w-5 h-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <div className="flex flex-col gap-4 mt-8">
                {navLinks.map((link) => (
                  <a key={link.label} href={link.href} onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-medium text-[#6B7280] hover:text-[#111111]">{link.label}</a>
                ))}
                <hr className="border-[#E5E7EB]" />
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                  className="text-left text-lg font-medium text-[#6B7280]">Logga in</Link>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                  className="px-5 py-3 text-sm font-medium bg-[#111111] text-white rounded-full text-center">Kom igång</Link>
              </div>
            </SheetContent>
          </Sheet>
        </motion.div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center justify-center pt-32 pb-12 overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute inset-0 grain-overlay" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-[#7C3AED]/10 via-transparent to-[#EC4899]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-[#3B82F6]/10 via-transparent to-[#10B981]/10 rounded-full blur-3xl" />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { pos: 'top-[20%] left-[5%]', rotate: 'rotate-12', delay: 0.5 },
            { pos: 'bottom-[25%] left-[5%]', rotate: '-rotate-12', delay: 0.7 },
            { pos: 'top-[20%] right-[5%]', rotate: '-rotate-12', delay: 0.9 },
            { pos: 'bottom-[25%] right-[5%]', rotate: 'rotate-12', delay: 1.1 },
          ].map((r, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 0.6 }}
              transition={{ duration: 2, delay: r.delay }}
              className={`absolute ${r.pos} w-[45%] h-3 ${r.rotate} rounded-full ribbon-gradient`}
              style={{ filter: 'blur(2px)' }} />
          ))}
        </div>

        <div className="relative z-10 max-w-[820px] mx-auto px-6 text-center">
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-[36px] sm:text-[48px] md:text-[64px] lg:text-[72px] font-extrabold leading-[1.05] tracking-tight mb-6">
            LÅT AI SKRAPA <br />
            <span className="gradient-text">E-COMMERCE DATA</span> ÅT DIG
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-[#6B7280] leading-relaxed mb-10 max-w-[600px] mx-auto">
            Automatisera produktutvinning, övervaka konkurrenter och samla strukturerad data från alla nätbutiker — snabbare och i stor skala.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/login" className="btn-primary">
              Starta gratis <ArrowRight className="inline-block w-5 h-5 ml-2" />
            </Link>
            <Link href="/login" className="btn-secondary">Se demo</Link>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }} className="relative mt-16">
            <div className="bg-white rounded-2xl shadow-2xl shadow-[#7C3AED]/10 border border-[#E5E7EB] p-4 max-w-4xl mx-auto">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E5E7EB]">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-[#6B7280]">Dashboard - E-Scraper</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Övervakade produkter', value: '1,247', color: 'text-[#111111]' },
                  { label: 'Aktiva konkurrenter', value: '5', color: 'text-[#111111]' },
                  { label: 'Prissänkningar', value: '23', color: 'text-[#10B981]' },
                ].map((s) => (
                  <div key={s.label} className="bg-[#F5F5F4] rounded-xl p-3">
                    <div className="text-xs text-[#6B7280] mb-1">{s.label}</div>
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div className="bg-[#F5F5F4] rounded-xl p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[#6B7280]">
                      <th className="pb-2">Produkt</th><th className="pb-2">Ditt pris</th>
                      <th className="pb-2">Lägst</th><th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Bugaboo Fox 5', yours: '8 570 kr', low: '7 713 kr', pct: '+11%' },
                      { name: 'Stokke Xplory X', yours: '14 290 kr', low: '13 990 kr', pct: '+2%' },
                    ].map((row) => (
                      <tr key={row.name} className="border-t border-[#E5E7EB]">
                        <td className="py-2 text-[#111111]">{row.name}</td>
                        <td className="py-2 text-[#111111]">{row.yours}</td>
                        <td className="py-2 text-[#10B981]">{row.low}</td>
                        <td className="py-2"><span className="bg-[#FEE2E2] text-[#DC2626] px-2 py-0.5 rounded-full text-xs">{row.pct}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-sm font-medium text-[#7C3AED] tracking-widest uppercase">Så fungerar det</motion.span>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: 0.1 }}
              className="text-[36px] md:text-[40px] font-bold mt-4 text-[#111111]">
              Tre enkla steg för att komma igång
            </motion.h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Koppla din butik', desc: 'Lägg till din e-handelsplattform eller klistra in produkt-URL:er. Vår AI analyserar strukturen automatiskt.', icon: Globe },
              { step: '02', title: 'Konfigurera övervakning', desc: 'Välj vilka konkurrenter du vill spåra, vilka data du vill extrahera och hur ofta du vill skrapa.', icon: BarChart3 },
              { step: '03', title: 'Få AI-insikter', desc: 'Ta emot strukturerad data, prisvarningar och handlingsbara rekommendationer drivna av AI.', icon: TrendingUp },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="relative p-8 rounded-2xl bg-[#F5F5F4] border border-[#E5E7EB]">
                <span className="text-6xl font-extrabold text-[#E5E7EB] absolute top-4 right-6">{item.step}</span>
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-6 shadow-sm">
                  <item.icon className="w-7 h-7 text-[#7C3AED]" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-[#111111]">{item.title}</h3>
                <p className="text-[#6B7280] leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES / FEATURES */}
      <section id="use-cases" className="py-24 px-6 bg-[#F5F5F4]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-sm font-medium text-[#7C3AED] tracking-widest uppercase">Funktioner</motion.span>
            <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: 0.1 }}
              className="text-[36px] md:text-[40px] font-bold mt-4 text-[#111111]">
              Kraftfulla funktioner för varje behov
            </motion.h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Prisövervakning', desc: 'Spåra konkurrenters priser i realtid och justera din prissättningsstrategi automatiskt.', icon: BarChart3, color: 'from-[#7C3AED] to-[#A855F7]' },
              { title: 'Produktintelligens', desc: 'Extrahera produktdetaljer, bilder, beskrivningar och specifikationer från alla e-handelssajter.', icon: Database, color: 'from-[#EC4899] to-[#F472B6]' },
              { title: 'Lagerspårning', desc: 'Övervaka lagerstatus hos konkurrenter och missa aldrig en försäljningsmöjlighet.', icon: ShoppingCart, color: 'from-[#F97316] to-[#FB923C]' },
              { title: 'Recensionsanalys', desc: 'Samla in och analysera kundrecensioner för att förstå marknads sentiment.', icon: Star, color: 'from-[#10B981] to-[#34D399]' },
              { title: 'Konkurrentforskning', desc: 'Upptäck nya konkurrenter och analysera deras produktkataloger och prissättning.', icon: Users, color: 'from-[#3B82F6] to-[#60A5FA]' },
              { title: 'Marknadstrender', desc: 'Identifiera framväxande trender och möjligheter innan dina konkurrenter.', icon: TrendingUp, color: 'from-[#8B5CF6] to-[#A78BFA]' },
            ].map((feature, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group p-6 rounded-2xl bg-white border border-[#E5E7EB] hover:shadow-xl hover:shadow-[#7C3AED]/5 transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-[#111111]">{feature.title}</h3>
                <p className="text-[#6B7280] leading-relaxed text-sm">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 px-6 bg-white border-t border-[#E5E7EB]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-bold text-[#111111]">E-<span className="gradient-text">SCRAPER</span></span>
          <div className="flex items-center gap-6 text-sm text-[#6B7280]">
            <a href="#" className="hover:text-[#111111] transition-colors">Integritet</a>
            <a href="#" className="hover:text-[#111111] transition-colors">Villkor</a>
            <a href="#" className="hover:text-[#111111] transition-colors">Kontakt</a>
          </div>
          <div className="text-sm text-[#9CA3AF]">© 2026 E-Scraper. Alla rättigheter reserverade.</div>
        </div>
      </footer>
    </div>
  );
}
