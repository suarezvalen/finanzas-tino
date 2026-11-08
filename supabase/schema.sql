-- Finanzas Tino: tabla para sincronizar entre dispositivos.
-- Pegar todo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez sin problema.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null,          -- accounts, transactions, categories, meta, ...
  id         text        not null,
  data       jsonb       not null,          -- el registro completo
  updated_at timestamptz not null,          -- cuándo se modificó en el dispositivo
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default now(), -- cuándo llegó al servidor (para bajar solo lo nuevo)
  primary key (user_id, kind, id)
);

create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- Cada usuario ve y modifica solo sus propios datos.
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
create policy "records_select_own" on public.records for select to authenticated using (auth.uid() = user_id);
create policy "records_insert_own" on public.records for insert to authenticated with check (auth.uid() = user_id);
create policy "records_update_own" on public.records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.records to authenticated;
revoke all on public.records from anon;

-- Gana siempre la versión más nueva, y se marca la hora de llegada al servidor.
create or replace function public.records_before_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old; -- llegó una versión más vieja: se ignora
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write before insert or update on public.records
  for each row execute function public.records_before_write();
