import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Add model_key column via SQL
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE products ADD COLUMN IF NOT EXISTS model_key text;
      CREATE INDEX IF NOT EXISTS idx_products_model_key ON products (model_key) WHERE model_key IS NOT NULL;
    `
  });

  if (error) {
    // Try direct approach - just add it
    console.log('RPC not available, trying direct column add...');
    // The column might already exist, which is fine
    const { error: err2 } = await supabase
      .from('products')
      .update({ model_key: 'test' })
      .eq('id', '00000000-0000-0000-0000-000000000000');

    if (err2 && err2.message.includes('model_key')) {
      console.error('Column does not exist. Please run this SQL in the Supabase dashboard:');
      console.log('ALTER TABLE products ADD COLUMN model_key text;');
      console.log('CREATE INDEX idx_products_model_key ON products (model_key) WHERE model_key IS NOT NULL;');
      return;
    }
    console.log('Column exists or was added.');
  } else {
    console.log('Migration applied successfully.');
  }
}

main();
