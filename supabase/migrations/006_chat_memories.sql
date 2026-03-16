-- AI chat memory system
-- Stores extracted facts, preferences, and decisions from conversations
create table chat_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text not null check (category in ('fact', 'preference', 'decision', 'context')),
  content text not null,
  source_conversation_id uuid references chat_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chat_memories_user on chat_memories (user_id, updated_at desc);
create index idx_chat_memories_category on chat_memories (user_id, category);

-- RLS
alter table chat_memories enable row level security;

create policy "Users read own memories" on chat_memories for select to authenticated using (user_id = auth.uid());
create policy "Users insert own memories" on chat_memories for insert to authenticated with check (user_id = auth.uid());
create policy "Users update own memories" on chat_memories for update to authenticated using (user_id = auth.uid());
create policy "Users delete own memories" on chat_memories for delete to authenticated using (user_id = auth.uid());
