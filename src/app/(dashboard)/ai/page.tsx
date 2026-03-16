'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Plus, MessageSquare, Trash2, Brain, X, Pencil, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface Memory {
  id: string;
  category: 'fact' | 'preference' | 'decision' | 'context';
  content: string;
  created_at: string;
  updated_at?: string;
}

const GREETING: Message = {
  role: 'assistant',
  content:
    'Hej! Jag kan hjälpa dig analysera priser, konkurrenter och trender. Fråga mig vad som helst om din produktdata.',
};

const CATEGORY_LABELS: Record<string, string> = {
  fact: 'Fakta',
  preference: 'Preferens',
  decision: 'Beslut',
  context: 'Kontext',
};

const CATEGORY_COLORS: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-700',
  preference: 'bg-purple-100 text-purple-700',
  decision: 'bg-green-100 text-green-700',
  context: 'bg-amber-100 text-amber-700',
};

export default function AIChatPage() {
  const supabase = createClient();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Memory state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemories, setShowMemories] = useState(false);
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Load conversations after auth session is ready
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadConversations();
        loadMemories();
      }
    });
    loadConversations();
    loadMemories();
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    setConversations(data || []);
    setLoadingConversations(false);
  }, [supabase]);

  async function loadMemories() {
    try {
      const res = await fetch('/api/chat/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      // silent
    }
  }

  async function deleteMemory(id: string) {
    const res = await fetch('/api/chat/memories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }

  async function updateMemory(id: string) {
    if (!editContent.trim()) return;
    const res = await fetch('/api/chat/memories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, content: editContent.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: data.memory.content, updated_at: data.memory.updated_at } : m))
      );
      setEditingMemory(null);
      setEditContent('');
    }
  }

  async function loadMessages(conversationId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (data && data.length > 0) {
      setMessages([GREETING, ...data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))]);
    } else {
      setMessages([GREETING]);
    }
  }

  async function selectConversation(conv: Conversation) {
    setActiveConversationId(conv.id);
    await loadMessages(conv.id);
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([GREETING]);
    setInput('');
  }

  async function deleteConversation(e: React.MouseEvent, convId: string) {
    e.stopPropagation();
    await supabase.from('chat_conversations').delete().eq('id', convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConversationId === convId) {
      startNewConversation();
    }
  }

  async function handleSend() {
    const message = input.trim();
    if (!message || loading) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: message };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      let conversationId = activeConversationId;

      // Create conversation on first message
      if (!conversationId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const title = message.length > 50 ? message.slice(0, 50) + '...' : message;
        const { data: conv, error } = await supabase
          .from('chat_conversations')
          .insert({ user_id: user.id, title })
          .select('id, title, updated_at')
          .single();

        if (error || !conv) throw new Error('Failed to create conversation');

        conversationId = conv.id;
        setActiveConversationId(conversationId);
        setConversations((prev) => [conv, ...prev]);
      }

      // Save user message
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
      });

      // Build history from current messages (skip the greeting)
      const history = messages
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));

      // Call API with history and conversationId
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, conversationId }),
      });

      const data = await res.json();
      const reply = data.reply || 'Kunde inte generera svar.';

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);

      // Save assistant message
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: reply,
      });

      // Update conversation timestamp
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Move conversation to top of list
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === conversationId);
        if (!conv) return prev;
        return [{ ...conv, updated_at: new Date().toISOString() }, ...prev.filter((c) => c.id !== conversationId)];
      });

      // Refresh memories after a short delay (extraction happens in background)
      setTimeout(() => loadMemories(), 3000);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Ett fel uppstod. Försök igen.' }]);
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

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} tim sedan`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} dag${diffDays > 1 ? 'ar' : ''} sedan`;
    return date.toLocaleDateString('sv-SE');
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Assistent</h1>
          <p className="text-muted-foreground">Fråga om priser, trender och konkurrenter</p>
        </div>
        <Button
          variant={showMemories ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowMemories(!showMemories)}
          className="gap-2"
        >
          <Brain className="h-4 w-4" />
          Minne ({memories.length})
        </Button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sidebar - conversation list */}
        <div className="w-64 flex-shrink-0 flex flex-col">
          <Button
            onClick={startNewConversation}
            className="mb-3 w-full"
            variant={activeConversationId === null ? 'default' : 'outline'}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ny konversation
          </Button>

          <ScrollArea className="flex-1">
            <div className="space-y-1 pr-2">
              {loadingConversations && conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">Laddar...</p>
              )}
              {!loadingConversations && conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                  Inga tidigare konversationer
                </p>
              )}
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors group flex items-start gap-2 ${
                    activeConversationId === conv.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(conv.updated_at)}</p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500"
                    title="Ta bort"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Chat area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-blue-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <p className="text-sm text-muted-foreground animate-pulse">Tänker...</p>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ställ en fråga om dina produkter och priser..."
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <Button onClick={handleSend} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Tryck Enter för att skicka, Shift+Enter för ny rad
            </p>
          </div>
        </Card>

        {/* Memory panel */}
        {showMemories && (
          <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" />
                <h3 className="font-semibold text-sm">AI Minne</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowMemories(false)} className="h-6 w-6 p-0">
                <X className="h-3 w-3" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {memories.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Inga minnen ännu. AI:n sparar automatiskt viktiga insikter från dina konversationer.
                  </p>
                )}
                {memories.map((mem) => (
                  <div key={mem.id} className="border rounded-lg p-2.5 group hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[mem.category] || 'bg-gray-100 text-gray-700'}`}>
                        {CATEGORY_LABELS[mem.category] || mem.category}
                      </span>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingMemory === mem.id ? (
                          <button
                            onClick={() => updateMemory(mem.id)}
                            className="p-1 hover:text-green-600"
                            title="Spara"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditingMemory(mem.id); setEditContent(mem.content); }}
                            className="p-1 hover:text-blue-600"
                            title="Redigera"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteMemory(mem.id)}
                          className="p-1 hover:text-red-500"
                          title="Ta bort"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {editingMemory === mem.id ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full text-xs border rounded p-1.5 resize-none"
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateMemory(mem.id); }
                          if (e.key === 'Escape') { setEditingMemory(null); setEditContent(''); }
                        }}
                      />
                    ) : (
                      <p className="text-xs text-gray-700 leading-relaxed">{mem.content}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDate(mem.created_at)}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}
      </div>
    </div>
  );
}
