#!/usr/bin/env node
/**
 * Ask DraGold — verify the authenticated collection path end to end:
 *   test user JWT -> userClient -> collection tool -> portfolio_valuations -> agent
 *
 * Creates a throwaway auth user + a few collection rows, runs the checks, then
 * deletes everything. Read-only against the catalogue; the only writes are the
 * test user's own collection rows (cleaned up).
 *
 *   set -a && source .env.local && set +a && node scripts/verify-ask-collection.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { MockLanguageModelV2 } from 'ai/test';
import { userClient } from '../api/_lib/ask/db.js';
import * as impl from '../api/_lib/ask/toolImpls.js';
import { runAgent } from '../api/_lib/ask/agent.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !svcKey || !anonKey) { console.error('need SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY'); process.exit(2); }

const admin = createClient(url, svcKey, { auth: { persistSession: false } });
const EMAIL = `ask-verify+${Date.now()}@dragold.test`;
const PASSWORD = `T-${Math.random().toString(36).slice(2)}-${Date.now()}`;
let userId = null;
const fails = [];
const check = (name, ok, detail) => { console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails.push(name); };

async function main() {
  // 1. create + confirm test user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (cErr) throw cErr;
  userId = created.user.id;
  console.log(`test user ${userId} (${EMAIL})`);

  // 2. sign in -> access token
  const authed = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: sErr } = await authed.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (sErr) throw sErr;
  const jwt = session.session.access_token;
  const userSb = userClient(jwt);
  check('userClient built from JWT', !!userSb);

  // 3. seed a few real cards into the test user's collection
  //    pick cards that DO have valuations (One Piece is best-covered per Fase 3)
  const { data: opCards } = await admin.from('cards')
    .select('id,tcg,name,set_name,card_number')
    .eq('tcg', 'onepiece').eq('lang', 'en').not('card_number', 'is', null).limit(3);
  const seed = (opCards || []).map((c, i) => ({
    user_id: userId,
    card_api_id: c.id.replace(/^onepiece:/, ''),   // collection.card_api_id is cards.id WITHOUT the tcg prefix
    tcg: c.tcg, card_name: c.name, set_name: c.set_name, card_number: c.card_number,
    quantity: i + 1,
  }));
  const { error: insErr } = await admin.from('collection').insert(seed);
  check('seeded collection rows', !insErr, insErr?.message);

  // 4. RLS: the user sees exactly their own rows
  const { data: mine } = await userSb.from('collection').select('id,card_api_id,quantity');
  check('RLS: user reads their own collection', (mine || []).length === seed.length, `${(mine || []).length} rows`);

  // 5. collection tool — summary
  const summary = await impl.collection({ sb: admin, userSb }, { mode: 'summary' });
  check('collection summary available', summary.available === true, JSON.stringify(summary).slice(0, 200));
  check('summary has a numeric estimated_total_eur', typeof summary.estimated_total_eur === 'number');
  check('summary counts add up', (summary.valued_cards + summary.unvalued_cards) === summary.total_cards,
    `${summary.valued_cards}+${summary.unvalued_cards} vs ${summary.total_cards}`);
  check('summary has a confidence_mix and disclaimer', !!summary.confidence_mix && !!summary.disclaimer);
  console.log('   →', JSON.stringify({ total_eur: summary.estimated_total_eur, valued: summary.valued_cards, unvalued: summary.unvalued_cards, mix: summary.confidence_mix }));

  // 6. collection tool — set_completion (best-effort, must carry the caveat)
  const setId = (opCards?.[0]?.id.match(/(OP-?\d+|EB-?\d+|ST-?\d+)/i) || [])[0] || 'OP-01';
  const completion = await impl.collection({ sb: admin, userSb }, { mode: 'set_completion', set_id: setId });
  check('set_completion returns a caveat (best-effort)', /best-effort|not always tagged/i.test(completion.caveat || ''), completion.caveat);

  // 7. full agent run with the authenticated ctx (mock model that calls collection)
  const model = new MockLanguageModelV2({
    doGenerate: (() => { let i = 0; return async () => {
      i++;
      return i === 1
        ? { finishReason: 'tool-calls', usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 }, warnings: [],
            content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'collection', input: JSON.stringify({ mode: 'summary' }) }] }
        : { finishReason: 'stop', usage: { inputTokens: 60, outputTokens: 20, totalTokens: 80 }, warnings: [],
            content: [{ type: 'text', text: 'Reported the collection summary from tool output.' }] };
    }; })(),
  });
  const agentOut = await runAgent({ message: 'what is my collection worth?', ctx: { sb: admin, userSb }, modelOverride: model });
  check('agent used the collection tool', (agentOut.meta.tools_used || []).includes('collection'));
  check('agent evidence carries the collection summary', agentOut.evidence.collection && agentOut.evidence.collection.available === true);

  // 8. anonymous still refuses
  const anon = await impl.collection({ sb: admin, userSb: null }, { mode: 'summary' });
  check('anonymous ctx -> sign_in_required', anon.available === false && anon.reason === 'sign_in_required');
}

async function cleanup() {
  try { await admin.from('collection').delete().eq('user_id', userId); } catch {}
  try { if (userId) await admin.auth.admin.deleteUser(userId); } catch (e) { console.error('cleanup: could not delete user', userId, e.message); }
  console.log('cleaned up');
}

main()
  .catch(e => { console.error('FATAL', e.stack || e.message); fails.push('fatal'); })
  .finally(async () => {
    await cleanup();
    console.log(fails.length ? `\nFAIL — ${fails.length}: ${fails.join(', ')}` : '\nOK — authenticated collection path verified');
    process.exit(fails.length ? 1 : 0);
  });
