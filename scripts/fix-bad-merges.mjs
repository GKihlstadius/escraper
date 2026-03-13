import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Re-activate all products that were deactivated by the merge script
// The merge script only set is_active=false — the products still exist
const { data: deactivated } = await sb
  .from('products')
  .select('id, name, brand')
  .eq('is_active', false);

console.log(`Found ${deactivated?.length || 0} deactivated products. Re-activating all...`);

if (deactivated?.length) {
  const ids = deactivated.map(p => p.id);
  // Re-activate in batches
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    await sb.from('products').update({ is_active: true }).in('id', batch);
  }
  console.log('Re-activated all products.');
}

// Now the problem is: some variants were moved to wrong products.
// We need to check which variants were moved and if they make sense.
// The safest approach: find variants where the product name doesn't match
// the variant name at all, and flag them.

const { data: allVariants } = await sb
  .from('product_variants')
  .select('id, product_id, variant_name, color');

const { data: allProducts } = await sb
  .from('products')
  .select('id, name, brand');

const productMap = new Map(allProducts.map(p => [p.id, p]));

// Check for orphan variants (product_id points to wrong product)
let suspicious = 0;
for (const v of allVariants) {
  const product = productMap.get(v.product_id);
  if (!product) {
    console.log(`ORPHAN variant ${v.id}: "${v.variant_name}" → product ${v.product_id} not found`);
    suspicious++;
    continue;
  }

  // Check if variant name shares at least one significant word with product name
  const productWords = new Set(
    product.name.toLowerCase()
      .replace(/[^\w\såäöé-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
  );
  const variantWords = v.variant_name?.toLowerCase()
    .replace(/[^\w\såäöé-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3) || [];

  const overlap = variantWords.filter(w => productWords.has(w)).length;
  if (overlap === 0 && variantWords.length > 0) {
    // This variant probably doesn't belong to this product
    console.log(`MISMATCH: variant "${v.variant_name}" under product "${product.name}" (${product.brand})`);
    suspicious++;
  }
}

console.log(`\nFound ${suspicious} suspicious variant assignments.`);
console.log('\nNote: These may need manual review. The safest fix is to re-scrape.');
