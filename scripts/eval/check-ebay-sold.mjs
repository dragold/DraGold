import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()])
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function checkEbaySold() {
  const { data: rows, error } = await sb.from("card_prices")
    .select("id, card_id, source, currency, price_market, timeframe, captured_at, raw_response")
    .eq("source", "ebay_sold")
    .limit(5);

  console.log("Query error:", error);
  for (const r of (rows || [])) {
    console.log("Record ID:", r.id);
    console.log("  card_id:", r.card_id);
    console.log("  currency:", r.currency);
    console.log("  price_market:", r.price_market);
    console.log("  timeframe:", r.timeframe);
    console.log("  captured_at:", r.captured_at);
    console.log("  raw_response:", JSON.stringify(r.raw_response));
  }

  // Also check if any ebay_sold rows have item_id or transaction_id
  const { data: nonNullTimeframe } = await sb.from("card_prices")
    .select("id, card_id, timeframe, price_market, raw_response")
    .eq("source", "ebay_sold")
    .not("timeframe", "is", null)
    .limit(3);
  console.log("\nRows with timeframe (e.g. 7d/30d/90d):", nonNullTimeframe);
}
checkEbaySold().catch(console.error);
