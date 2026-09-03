-- Ask DraGold — agent_queries retention (security review finding F1).
-- The query text is kept only for eval/debugging; it should not accumulate
-- forever. Prune rows older than N days (default 90) on a daily schedule.
-- DOWN: 20260903191000_agent_queries_retention_down.sql

create or replace function public.prune_agent_queries(p_days int default 90)
returns integer
language sql
security definer
set search_path = ''
as $$
  with del as (
    delete from public.agent_queries
    where created_at < now() - make_interval(days => greatest(p_days, 1))
    returning 1
  )
  select count(*)::int from del;
$$;

revoke all on function public.prune_agent_queries(int) from public, anon, authenticated;

-- Daily prune via pg_cron (already enabled on this project — see cron.job).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-agent-queries') where exists (
      select 1 from cron.job where jobname = 'prune-agent-queries');
    perform cron.schedule('prune-agent-queries', '17 4 * * *',
      $cron$ select public.prune_agent_queries(90); $cron$);
  end if;
end $$;
