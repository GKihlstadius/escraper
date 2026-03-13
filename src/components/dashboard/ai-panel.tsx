'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Minus, MessageSquare, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type PanelState = 'closed' | 'minimized' | 'open';

interface AIPanelProps {
  panelState: PanelState;
  onStateChange: (state: PanelState) => void;
}

export function AIPanel({ panelState, onStateChange }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hej! Jag kan hjälpa dig analysera priser, konkurrenter och trender. Fråga mig vad som helst om din produktdata.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function changeState(state: PanelState) {
    onStateChange(state);
  }

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (panelState === 'open') {
      textareaRef.current?.focus();
    }
  }, [panelState]);

  async function handleSend() {
    const message = input.trim();
    if (!message || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || 'Kunde inte generera svar.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Ett fel uppstod. Försök igen.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Floating button when closed
  if (panelState === 'closed') {
    return (
      <button
        onClick={() => changeState('open')}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  // Minimized bar at bottom-right
  if (panelState === 'minimized') {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-2xl shadow-lg px-4 py-3 cursor-pointer hover:shadow-xl transition-shadow"
        onClick={() => changeState('open')}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-medium text-[#111111]">AI Assistent</span>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); changeState('open'); }}
            className="p-1 hover:bg-[#F5F5F4] rounded-lg transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-[#6B7280]" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); changeState('closed'); }}
            className="p-1 hover:bg-red-50 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-[#6B7280] hover:text-red-500" />
          </button>
        </div>
      </div>
    );
  }

  // Full panel — rendered inline by parent, not fixed
  return (
    <div className="h-full w-full bg-white border-l border-[#E5E7EB] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[#111111] text-sm">AI Assistent</h3>
            <p className="text-xs text-[#6B7280]">Prisanalys & rekommendationer</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => changeState('minimized')}
            className="p-2 hover:bg-[#F5F5F4] rounded-xl transition-colors"
            title="Minimera"
          >
            <Minus className="w-4 h-4 text-[#6B7280]" />
          </button>
          <button
            onClick={() => changeState('closed')}
            className="p-2 hover:bg-red-50 rounded-xl transition-colors"
            title="Stäng"
          >
            <X className="w-4 h-4 text-[#6B7280] hover:text-red-500" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn('flex gap-3', msg.role === 'user' && 'justify-end')}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-[#7C3AED]" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5',
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-[#7C3AED] to-[#7C3AED]/90 text-white'
                  : 'bg-[#F5F5F4] text-[#111111]'
              )}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EC4899] flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-white" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/20 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-[#7C3AED]" />
            </div>
            <div className="bg-[#F5F5F4] rounded-2xl px-4 py-2.5">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#7C3AED]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#7C3AED]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#7C3AED]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#E5E7EB] p-4 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Fråga om priser, trender..."
            className="min-h-[44px] max-h-28 resize-none rounded-xl border-[#E5E7EB] bg-[#F5F5F4] focus:bg-white transition-colors text-sm"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            size="icon"
            className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#EC4899] hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Send className="h-4 w-4 text-white" />
          </Button>
        </div>
        <p className="text-[11px] text-[#6B7280] mt-2 text-center">
          Enter för att skicka · Shift+Enter för ny rad
        </p>
      </div>
    </div>
  );
}
