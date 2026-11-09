import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()])
);
const sbAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testCardHistory() {
  const cardId = "onepiece:optcg:OP14-103:en";
  const start = Date.now();
  const { data, error, count } = await sbAnon.from("market_observations")
    .select("source, price, currency, price_eur, observed_at, sub_type, raw", { count: "exact" })
    .eq("card_id", cardId)
    .order("observed_at", { ascending: true })
    .limit(90);

  const duration = Date.now() - start;
  console.log("Query duration:", duration + "ms", "count:", count, "error:", error);
  console.log("First observation:", data?.[0]);
  console.log("Last observation:", data?.[data?.length - 1]);
}
testCardHistory().catch(console.error);
