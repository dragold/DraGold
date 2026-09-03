do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-agent-queries') where exists (
      select 1 from cron.job where jobname = 'prune-agent-queries');
  end if;
end $$;
drop function if exists public.prune_agent_queries(int);
