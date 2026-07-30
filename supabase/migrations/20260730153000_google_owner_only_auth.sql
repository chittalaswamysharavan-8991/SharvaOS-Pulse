create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.pulse_owner_registry (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

revoke all on private.pulse_owner_registry from public, anon, authenticated;

do $$
declare
  v_owner uuid;
  v_count integer;
begin
  select count(*) into v_count
  from auth.users
  where email_confirmed_at is not null;

  if v_count <> 1 then
    raise exception 'Google owner migration requires exactly one confirmed Auth user; found %', v_count;
  end if;

  select id into v_owner
  from auth.users
  where email_confirmed_at is not null
  order by created_at
  limit 1;

  insert into private.pulse_owner_registry (owner_id)
  values (v_owner)
  on conflict (owner_id) do nothing;

  delete from private.pulse_owner_registry where owner_id <> v_owner;
end;
$$;

create or replace function private.is_pulse_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.pulse_owner_registry r
    where r.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_pulse_owner() from public, anon;
grant execute on function private.is_pulse_owner() to authenticated;

create or replace function private.enforce_pulse_owner_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_id;
  else
    v_owner := new.owner_id;
  end if;

  if not exists (
    select 1 from private.pulse_owner_registry r where r.owner_id = v_owner
  ) then
    raise exception 'Registered Pulse owner required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.enforce_pulse_owner_row() from public, anon, authenticated;

drop trigger if exists pulse_logs_registered_owner_guard on public.pulse_logs;
create trigger pulse_logs_registered_owner_guard
before insert or update or delete on public.pulse_logs
for each row execute function private.enforce_pulse_owner_row();

drop trigger if exists pulse_todos_registered_owner_guard on public.pulse_todos;
create trigger pulse_todos_registered_owner_guard
before insert or update or delete on public.pulse_todos
for each row execute function private.enforce_pulse_owner_row();

drop trigger if exists pulse_receipts_registered_owner_guard on public.pulse_mutation_receipts;
create trigger pulse_receipts_registered_owner_guard
before insert or update or delete on public.pulse_mutation_receipts
for each row execute function private.enforce_pulse_owner_row();

drop policy if exists pulse_logs_registered_owner_select on public.pulse_logs;
create policy pulse_logs_registered_owner_select
on public.pulse_logs as restrictive for select to authenticated
using ((select private.is_pulse_owner()));

drop policy if exists pulse_todos_registered_owner_select on public.pulse_todos;
create policy pulse_todos_registered_owner_select
on public.pulse_todos as restrictive for select to authenticated
using ((select private.is_pulse_owner()));

drop policy if exists pulse_receipts_registered_owner_select on public.pulse_mutation_receipts;
create policy pulse_receipts_registered_owner_select
on public.pulse_mutation_receipts as restrictive for select to authenticated
using ((select private.is_pulse_owner()));

create or replace function public.hook_reject_new_pulse_users(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'SharvaOS Pulse is private. New user creation is disabled.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_reject_new_pulse_users(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_reject_new_pulse_users(jsonb) from authenticated, anon, public;
