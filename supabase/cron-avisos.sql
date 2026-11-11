-- Finanzas Tino: dispara el robot de avisos de GitHub a horario exacto.
-- El programador propio de GitHub se demora o saltea corridas; pg_cron de Supabase es puntual.
--
-- Cómo usarlo:
--   1. Reemplazá PEGAR_ACA_EL_TOKEN por tu token de GitHub (empieza con github_pat_…).
--   2. Supabase → SQL Editor → New query → pegá todo → Run.
-- Se puede volver a correr: si el token ya existía, lo actualiza.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Token guardado cifrado en el Vault de Supabase (no queda en ninguna tabla común).
do $$
begin
  if exists (select 1 from vault.secrets where name = 'github_avisos_token') then
    perform vault.update_secret((select id from vault.secrets where name = 'github_avisos_token'), 'PEGAR_ACA_EL_TOKEN');
  else
    perform vault.create_secret('PEGAR_ACA_EL_TOKEN', 'github_avisos_token', 'Token de GitHub para disparar el robot de avisos');
  end if;
end $$;

create or replace function public.disparar_robot_avisos() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://api.github.com/repos/suarezvalen/finanzas-tino/actions/workflows/avisos.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_avisos_token'),
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'finanzas-tino-avisos'),
    body := '{"ref":"main"}'::jsonb
  );
end $$;
revoke all on function public.disparar_robot_avisos() from public, anon, authenticated;

-- Horarios en UTC (Argentina = UTC−3):
--   cada 5 minutos de 10:00 a 17:55, lunes a viernes  → apertura (10:30) y avisos de cierre (17:00 y 18:00)
--   8:00 de lunes a viernes                             → aviso de feriado
select cron.unschedule(jobname) from cron.job where jobname in ('avisos-mercado', 'avisos-8am');
select cron.schedule('avisos-mercado', '*/5 13-20 * * 1-5', 'select public.disparar_robot_avisos()');
select cron.schedule('avisos-8am', '0 11 * * 1-5', 'select public.disparar_robot_avisos()');

-- Prueba inmediata: dispara una corrida ahora.
select public.disparar_robot_avisos();

-- Para revisar después (en otra consulta):
--   select jobname, schedule, active from cron.job;
--   select status_code, created from net._http_response order by created desc limit 5;   -- 204 = bien
