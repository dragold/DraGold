import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()])
);
// Test con ANON_KEY (come farebbe il client React nel browser!)
const sbAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkAnonRead() {
  const { data, error, count } = await sbAnon.from("market_observations")
    .select("card_id, price, currency, price_eur, observed_at, sub_type", { count: "exact" })
    .eq("tcg", "pokemon")
    .limit(3);

  console.log("Anon read market_observations error:", error);
  console.log("Anon read count:", count);
  console.log("Anon read sample:", data);
}
checkAnonRead().catch(console.error);
