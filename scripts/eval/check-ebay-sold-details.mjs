import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()])
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function checkEbaySoldDetails() {
  // Let's sample 10 distinct ebay_sold rows from different IDs
  const { data: rows } = await sb.from("card_prices")
    .select("id, card_id, price_market, currency, captured_at, raw_response")
    .eq("source", "ebay_sold")
    .order("id", { ascending: false })
    .limit(5);

  console.log("Latest 5 ebay_sold rows:");
  rows?.forEach(r => {
    console.log(r.id, r.card_id, r.price_market, r.currency, r.captured_at, r.raw_response);
  });

  const { data: oldestRows } = await sb.from("card_prices")
    .select("id, card_id, price_market, currency, captured_at, raw_response")
    .eq("source", "ebay_sold")
    .order("id", { ascending: true })
    .limit(5);

  console.log("\nOldest 5 ebay_sold rows:");
  oldestRows?.forEach(r => {
    console.log(r.id, r.card_id, r.price_market, r.currency, r.captured_at, r.raw_response);
  });
}
checkEbaySoldDetails().catch(console.error);
