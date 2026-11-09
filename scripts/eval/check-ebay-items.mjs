import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()])
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function checkEbayItems() {
  const res = await sb.from("card_ebay_items").select("*", { count: "exact" }).limit(5);
  console.log("card_ebay_items count:", res.count, "error:", res.error, "sample:", res.data);
}
checkEbayItems().catch(console.error);
