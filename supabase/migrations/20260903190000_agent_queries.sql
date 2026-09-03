-- Ask DraGold — agent_queries: minimal observability for /api/ask.
-- One row per answered (or failed) question. No unnecessary personal data:
-- no IP, no email, no raw user identity beyond an optional opaque user_id.
-- DOWN: 20260903190000_agent_queries_down.sql

create table if not exists public.agent_queries (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  query          text not null,
  user_id        uuid,                       -- optional; auth.uid() when signed in, else null
  provider       text,                       -- 'ollama' | 'gemini' | 'anthropic'
  model          text,
  latency_ms     integer,
  tools_used     text[] not null default '{}',
  tool_calls     jsonb,                      -- [{ tool, args, ok, ms }]
  outcome        text not null default 'ok'  -- 'ok' | 'insufficient_data' | 'error'
                 check (outcome in ('ok','insufficient_data','error')),
  error          text,
  input_tokens   integer,
  output_tokens  integer,
  total_tokens   integer,
  cost_usd       numeric
);

create index if not exists agent_queries_created_at_idx on public.agent_queries (created_at desc);
create index if not exists agent_queries_user_idx on public.agent_queries (user_id, created_at desc) where user_id is not null;

alter table public.agent_queries enable row level security;

-- Writes go through the service role only (the /api/ask endpoint). No anon/authenticated
-- INSERT policy. Owners may read their own rows; everything else is closed.
drop policy if exists agent_queries_owner_read on public.agent_queries;
create policy agent_queries_owner_read on public.agent_queries
  for select using (user_id is not null and auth.uid() = user_id);
