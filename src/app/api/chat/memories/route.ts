import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

// GET - List all memories
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_memories')
    .select('id, category, content, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memories: data || [] });
}

// POST - Create a memory manually
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category, content, conversationId } = await request.json();
  if (!content || !category) {
    return NextResponse.json({ error: 'category and content required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('chat_memories')
    .insert({
      user_id: user.id,
      category,
      content,
      source_conversation_id: conversationId || null,
    })
    .select('id, category, content, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memory: data });
}

// DELETE - Remove a memory
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('chat_memories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH - Update a memory
export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, content, category } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (content) updates.content = content;
  if (category) updates.category = category;

  const { data, error } = await supabase
    .from('chat_memories')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, category, content, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memory: data });
}
