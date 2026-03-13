import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Latest scrape logs
const { data: logs } = await sb.from("scraping_logs").select("created_at, status, message, products_scraped, duration_ms").order("created_at", { ascending: false }).limit(20);
console.log("=== SENASTE SCRAPE-LOGGAR ===");
console.table(logs);

// Product counts
const { count: totalProducts } = await sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true);
const { count: totalVariants } = await sb.from("product_variants").select("id", { count: "exact", head: true });
const { count: totalPrices } = await sb.from("product_prices").select("id", { count: "exact", head: true });
console.log("\n=== TOTALT I DATABASEN ===");
console.log("Produkter:", totalProducts);
console.log("Varianter:", totalVariants);
console.log("Prisrader:", totalPrices);

// Per competitor price counts
const { data: comps } = await sb.from("competitors").select("id, name, is_own_store").eq("is_active", true);
console.log("\n=== PER BUTIK ===");
for (const c of comps || []) {
  const { count } = await sb.from("product_prices").select("id", { count: "exact", head: true }).eq("competitor_id", c.id);
  console.log(`${c.name}${c.is_own_store ? ' (egen)' : ''}: ${count} prisrader`);
}

// Category breakdown
const { data: products } = await sb.from("products").select("category").eq("is_active", true);
const cats = {};
for (const p of products || []) {
  cats[p.category] = (cats[p.category] || 0) + 1;
}
console.log("\n=== PER KATEGORI ===");
Object.entries(cats).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(`${k}: ${v}`));
