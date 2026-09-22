-- 20260919_cron_jobs.sql
-- Configura i cron job per refresh-prices e cleanup.
--
-- Supabase free tier: pg_cron è disponibile ma va abilitato.
-- Se l'estensione non è disponibile, configura i cron job tramite
-- Supabase Dashboard → Integrations → Cron.
--
-- Job 1: refresh-prices ogni 6 ore
--   - Usa Edge Function (non RPC) perché le funzioni usano getServiceClient()
--     con SERVICE_ROLE_KEY e fanno fetch esterni.
--   - Schedule: 0 */6 * * * (00:00, 06:00, 12:00, 18:00 UTC)
--
-- Job 2: cleanup settimanale (domenica 04:00 UTC)
--   - Cancella api_call_log > 30 giorni
--   - Cancella card_prices > 180 giorni
--   - Cancella card_image_cache errori > 30 giorni

-- Abilita pg_cron se non già abilitato
create extension if not exists pg_cron with schema cron;

-- Job 1: refresh-prices ogni 6 ore
-- Nota: su Supabase, i cron job pg_cron eseguono SQL, non Edge Functions.
-- Per eseguire un'Edge Function via cron, si usa il dashboard Supabase
-- (Integrations → Cron → Create job → Edge Function).
-- Questa riga è qui per documentazione e per ambienti self-hosted.
--commentare o rimuovere se si usa il dashboard Supabase per il cron.
-- insert into cron.job (schedule, command, jobname, username)
-- values ('0 */6 * * *', 'select supabase_functions.schedule_function(\'refresh-prices\')', 'refresh-prices-6h', 'postgres')
-- on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;

-- Alternativa: view per monitorare lo stato del cron
create or replace view cron_job_status as
select
  j.jobid,
  j.jobname,
  j.schedule,
  j.command,
  j.active,
  l.last_start,
  l.last_end,
  l.run_status,
  l.return_message
from cron.job j
left join cron.job_run_details l on l.jobid = j.jobid
  and l.end_time = (
    select max(end_time) from cron.job_run_details where jobid = j.jobid
  )
order by j.jobid;

-- Job 2: cleanup settimanale via funzione SQL (eseguibile da pg_cron)
create or replace function public.weekly_cleanup() returns void as $$
begin
  -- Cancella api_call_log > 30 giorni
  delete from public.api_call_log
  where called_at < now() - interval '30 days';

  -- Cancella card_prices > 180 giorni (riga 180 nella migration 002)
  delete from public.card_prices
  where captured_at < now() - interval '180 days';

  -- Cancella card_image_cache errori > 30 giorni
  delete from public.card_image_cache
  where status = 'error'
    and created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;

-- Grant execute a postgres (per pg_cron)
grant execute on function public.weekly_cleanup() to postgres;

-- Note per il deploy:
-- 1. Su Supabase free tier, pg_cron potrebbe non essere disponibile.
--    In tal caso, configura i cron job tramite dashboard:
--    - Supabase Dashboard → Integrations → Cron → Create job
--    - Job 1: Edge Function "refresh-prices", schedule "0 */6 * * *"
--    - Job 2: Edge Function "cleanup" (deve essere creato come edge function
--      che chiama public.weekly_cleanup()), schedule "0 4 * * 0"
--
-- 2. Se pg_cron è disponibile, crea i job così:
--    insert into cron.job (schedule, command, jobname)
--    values ('0 */6 * * *', 'select public.refresh_prices_via_cron()', 'refresh-prices-6h');
--    insert into cron.job (schedule, command, jobname)
--    values ('0 4 * * 0', 'select public.weekly_cleanup()', 'weekly-cleanup');
--
-- 3. L'edge function refresh-prices deve essere deployata con "Verify JWT" DISATTIVATO
--    per permettere l'invocazione anonima da cron.
