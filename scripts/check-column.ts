import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  const { data, error } = await s.from('products').select('id, model_key').limit(1);
  console.log('data:', data);
  console.log('error:', error?.message);
}
main();
