-- Chat conversation history
create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Ny konversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_chat_conversations_user on chat_conversations (user_id, updated_at desc);
create index idx_chat_messages_conversation on chat_messages (conversation_id, created_at asc);

-- RLS
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "Users read own conversations" on chat_conversations for select to authenticated using (user_id = auth.uid());
create policy "Users insert own conversations" on chat_conversations for insert to authenticated with check (user_id = auth.uid());
create policy "Users update own conversations" on chat_conversations for update to authenticated using (user_id = auth.uid());
create policy "Users delete own conversations" on chat_conversations for delete to authenticated using (user_id = auth.uid());

create policy "Users read own messages" on chat_messages for select to authenticated
  using (conversation_id in (select id from chat_conversations where user_id = auth.uid()));
create policy "Users insert own messages" on chat_messages for insert to authenticated
  with check (conversation_id in (select id from chat_conversations where user_id = auth.uid()));
