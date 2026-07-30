create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pulse_logs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  kind text not null check (kind in ('water', 'smoke', 'food')),
  label text not null check (char_length(label) between 1 and 180),
  detail text not null default '' check (char_length(detail) <= 200),
  amount_ml integer,
  logged_at timestamptz not null,
  source text not null default 'pulse' check (char_length(source) between 1 and 40),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  validation_status text not null default 'valid' check (validation_status in ('valid', 'legacy_out_of_range')),
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 200),
  legacy_source text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pulse_logs_amount_contract check (
    (kind = 'water' and amount_ml between 1 and 5000)
    or (kind <> 'water' and amount_ml is null)
  ),
  constraint pulse_logs_validation_contract check (
    validation_status = 'valid'
    or (validation_status = 'legacy_out_of_range' and legacy_source is not null)
  ),
  unique (owner_id, idempotency_key),
  unique (legacy_source, legacy_id)
);

create table if not exists public.pulse_todos (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  text text not null check (char_length(text) between 1 and 180),
  done boolean not null default false,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  deleted_at timestamptz,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 200),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (owner_id, idempotency_key)
);

create table if not exists public.pulse_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  action text not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists pulse_logs_owner_date_idx
  on public.pulse_logs (owner_id, log_date, logged_at desc)
  where deleted_at is null;
create index if not exists pulse_logs_owner_kind_idx
  on public.pulse_logs (owner_id, kind, logged_at desc)
  where deleted_at is null;
create index if not exists pulse_todos_owner_date_idx
  on public.pulse_todos (owner_id, task_date, created_at)
  where deleted_at is null;
create index if not exists pulse_receipts_owner_created_idx
  on public.pulse_mutation_receipts (owner_id, created_at desc);

alter table public.pulse_logs enable row level security;
alter table public.pulse_todos enable row level security;
alter table public.pulse_mutation_receipts enable row level security;

revoke all on public.pulse_logs from anon, authenticated;
revoke all on public.pulse_todos from anon, authenticated;
revoke all on public.pulse_mutation_receipts from anon, authenticated;
grant select on public.pulse_logs to authenticated;
grant select on public.pulse_todos to authenticated;
grant select on public.pulse_mutation_receipts to authenticated;

create policy pulse_logs_owner_select
  on public.pulse_logs for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy pulse_todos_owner_select
  on public.pulse_todos for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy pulse_receipts_owner_select
  on public.pulse_mutation_receipts for select to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.pulse_read_day(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id::text,
          'kind', l.kind,
          'label', l.label,
          'detail', l.detail,
          'amount', l.amount_ml,
          'loggedAt', floor(extract(epoch from l.logged_at) * 1000)::bigint,
          'source', l.source,
          'validationStatus', l.validation_status
        ) order by l.logged_at desc
      )
      from public.pulse_logs l
      where l.owner_id = (select auth.uid())
        and l.log_date = p_date
        and l.deleted_at is null
    ), '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id::text,
          'text', t.text,
          'done', t.done,
          'createdAt', floor(extract(epoch from t.created_at) * 1000)::bigint
        ) order by t.created_at
      )
      from public.pulse_todos t
      where t.owner_id = (select auth.uid())
        and t.task_date = p_date
        and t.deleted_at is null
    ), '[]'::jsonb),
    'canonical', jsonb_build_object(
      'owner', 'supabase',
      'project', 'sharvaos-live-control-room',
      'contract', 'sharvaos.pulse.v1'
    )
  );
$$;

create or replace function public.pulse_apply_mutation(
  p_date date,
  p_idempotency_key text,
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_payload_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_result jsonb;
  v_confirmation jsonb;
  v_entity_id uuid;
  v_kind text;
  v_label text;
  v_detail text;
  v_source text;
  v_amount integer;
  v_logged_at timestamptz;
  v_created_at timestamptz;
  v_done boolean;
  v_log public.pulse_logs%rowtype;
  v_todo public.pulse_todos%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Valid date required' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 160 then
    raise exception 'Valid idempotency key required' using errcode = '22023';
  end if;
  if p_action is null or p_payload is null then
    raise exception 'Action and payload required' using errcode = '22023';
  end if;

  v_payload_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_idempotency_key, 0));

  select r.payload_hash, r.result
    into v_existing_hash, v_existing_result
  from public.pulse_mutation_receipts r
  where r.owner_id = v_owner and r.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_hash <> v_payload_hash then
      raise exception 'Idempotency key conflicts with different payload' using errcode = '23505';
    end if;
    return jsonb_set(v_existing_result, '{confirmation,replayed}', 'true'::jsonb, true);
  end if;

  if p_action = 'add_log' then
    v_entity_id := (p_payload->>'id')::uuid;
    v_kind := p_payload->>'kind';
    v_label := left(btrim(coalesce(p_payload->>'label', '')), 180);
    v_detail := left(btrim(coalesce(p_payload->>'detail', '')), 200);
    v_source := left(btrim(coalesce(nullif(p_payload->>'source', ''), 'web')), 40);
    if v_kind not in ('water', 'smoke', 'food') or v_label = '' then
      raise exception 'Invalid log entry' using errcode = '22023';
    end if;
    if not (p_payload ? 'loggedAt') or (p_payload->>'loggedAt')::numeric <= 0 then
      raise exception 'Valid loggedAt required' using errcode = '22023';
    end if;
    v_logged_at := to_timestamp(((p_payload->>'loggedAt')::numeric / 1000.0)::double precision);
    if v_kind = 'water' then
      v_amount := (p_payload->>'amount')::integer;
      if v_amount not between 50 and 2000 then
        raise exception 'Water amount must be 50 to 2000 ml' using errcode = '22023';
      end if;
    else
      v_amount := null;
    end if;

    insert into public.pulse_logs (
      id, owner_id, log_date, kind, label, detail, amount_ml, logged_at,
      source, idempotency_key, validation_status
    ) values (
      v_entity_id, v_owner, p_date, v_kind, v_label, v_detail, v_amount,
      v_logged_at, v_source, p_idempotency_key, 'valid'
    ) on conflict do nothing;

    select * into v_log from public.pulse_logs
      where id = v_entity_id and owner_id = v_owner;
    if not found
      or v_log.log_date <> p_date
      or v_log.kind <> v_kind
      or v_log.label <> v_label
      or v_log.detail <> v_detail
      or v_log.amount_ml is distinct from v_amount
      or v_log.logged_at <> v_logged_at
      or v_log.idempotency_key <> p_idempotency_key then
      raise exception 'Log write conflict' using errcode = '23505';
    end if;
    v_confirmation := jsonb_build_object(
      'action', p_action, 'id', v_entity_id::text, 'state', 'persisted'
    );

  elsif p_action = 'delete_log' then
    v_entity_id := (p_payload->>'id')::uuid;
    update public.pulse_logs
      set deleted_at = coalesce(deleted_at, now()),
          delete_reason = left(coalesce(nullif(btrim(p_payload->>'reason'), ''), 'user correction'), 200),
          updated_at = now()
      where id = v_entity_id and owner_id = v_owner and log_date = p_date;
    v_confirmation := jsonb_build_object(
      'action', p_action, 'id', v_entity_id::text, 'state', 'absent'
    );

  elsif p_action = 'add_todo' then
    v_entity_id := (p_payload->>'id')::uuid;
    v_label := left(btrim(coalesce(p_payload->>'text', '')), 180);
    if v_label = '' or not (p_payload ? 'createdAt') or (p_payload->>'createdAt')::numeric <= 0 then
      raise exception 'Invalid task' using errcode = '22023';
    end if;
    v_created_at := to_timestamp(((p_payload->>'createdAt')::numeric / 1000.0)::double precision);
    insert into public.pulse_todos (
      id, owner_id, task_date, text, done, idempotency_key, created_at, updated_at
    ) values (
      v_entity_id, v_owner, p_date, v_label, false, p_idempotency_key,
      v_created_at, v_created_at
    ) on conflict do nothing;

    select * into v_todo from public.pulse_todos
      where id = v_entity_id and owner_id = v_owner;
    if not found
      or v_todo.task_date <> p_date
      or v_todo.text <> v_label
      or v_todo.created_at <> v_created_at
      or v_todo.idempotency_key <> p_idempotency_key then
      raise exception 'Task write conflict' using errcode = '23505';
    end if;
    v_confirmation := jsonb_build_object(
      'action', p_action, 'id', v_entity_id::text, 'state', 'persisted'
    );

  elsif p_action = 'toggle_todo' then
    v_entity_id := (p_payload->>'id')::uuid;
    if not (p_payload ? 'done') then
      raise exception 'Task state required' using errcode = '22023';
    end if;
    v_done := (p_payload->>'done')::boolean;
    update public.pulse_todos
      set done = v_done, updated_at = now()
      where id = v_entity_id and owner_id = v_owner and task_date = p_date and deleted_at is null;
    select * into v_todo from public.pulse_todos
      where id = v_entity_id and owner_id = v_owner and task_date = p_date and deleted_at is null;
    if not found or v_todo.done <> v_done then
      raise exception 'Task update could not be confirmed' using errcode = 'P0002';
    end if;
    v_confirmation := jsonb_build_object(
      'action', p_action, 'id', v_entity_id::text,
      'state', case when v_done then 'complete' else 'open' end
    );

  elsif p_action = 'delete_todo' then
    v_entity_id := (p_payload->>'id')::uuid;
    update public.pulse_todos
      set deleted_at = coalesce(deleted_at, now()),
          delete_reason = left(coalesce(nullif(btrim(p_payload->>'reason'), ''), 'user correction'), 200),
          updated_at = now()
      where id = v_entity_id and owner_id = v_owner and task_date = p_date;
    v_confirmation := jsonb_build_object(
      'action', p_action, 'id', v_entity_id::text, 'state', 'absent'
    );

  else
    raise exception 'Unsupported action' using errcode = '22023';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'confirmation', v_confirmation || jsonb_build_object('confirmed', true, 'replayed', false),
    'day', public.pulse_read_day(p_date),
    'canonical', jsonb_build_object(
      'owner', 'supabase',
      'project', 'sharvaos-live-control-room',
      'contract', 'sharvaos.pulse.v1'
    )
  );

  insert into public.pulse_mutation_receipts (
    owner_id, idempotency_key, action, payload_hash, result
  ) values (
    v_owner, p_idempotency_key, p_action, v_payload_hash, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.pulse_read_day(date) from public, anon;
revoke all on function public.pulse_apply_mutation(date, text, text, jsonb) from public, anon;
grant execute on function public.pulse_read_day(date) to authenticated;
grant execute on function public.pulse_apply_mutation(date, text, text, jsonb) to authenticated;

create or replace function public.pulse_mirror_legacy_water_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_user_count integer;
begin
  select count(*)::integer into v_user_count from auth.users;
  if v_user_count <> 1 then
    raise exception 'Legacy water mirror requires exactly one owner account';
  end if;
  select id into v_owner from auth.users order by created_at asc limit 1;

  insert into public.pulse_logs (
    id, owner_id, log_date, kind, label, detail, amount_ml, logged_at,
    source, idempotency_key, validation_status, legacy_source, legacy_id
  ) values (
    new.id, v_owner, new.log_date, 'water', new.amount_ml::text || ' ml water',
    coalesce(new.note, 'Hydration'), new.amount_ml, new.logged_at,
    coalesce(new.source, 'legacy-water'), 'compat:sharva_water_logs:' || new.id::text,
    case when new.amount_ml between 50 and 2000 then 'valid' else 'legacy_out_of_range' end,
    'sharva_water_logs', new.id::text
  ) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.pulse_mirror_legacy_water_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pulse_logs
    set deleted_at = new.voided_at,
        delete_reason = new.reason,
        updated_at = now()
    where legacy_source = 'sharva_water_logs' and legacy_id = new.entry_id::text;
  return new;
end;
$$;

drop trigger if exists pulse_mirror_legacy_water_insert_trigger on public.sharva_water_logs;
create trigger pulse_mirror_legacy_water_insert_trigger
after insert on public.sharva_water_logs
for each row execute function public.pulse_mirror_legacy_water_insert();

drop trigger if exists pulse_mirror_legacy_water_void_trigger on public.sharva_water_log_voids;
create trigger pulse_mirror_legacy_water_void_trigger
after insert or update on public.sharva_water_log_voids
for each row execute function public.pulse_mirror_legacy_water_void();

do $$
declare
  v_owner uuid;
  v_user_count integer;
begin
  select count(*)::integer into v_user_count from auth.users;
  if v_user_count <> 1 then
    raise exception 'Canonical Pulse migration requires exactly one owner account';
  end if;
  select id into v_owner from auth.users order by created_at asc limit 1;

  insert into public.pulse_logs (
    id, owner_id, log_date, kind, label, detail, amount_ml, logged_at,
    source, idempotency_key, validation_status, deleted_at, delete_reason,
    legacy_source, legacy_id
  )
  select
    l.id, v_owner, l.log_date, 'water', l.amount_ml::text || ' ml water',
    coalesce(l.note, 'Hydration'), l.amount_ml, l.logged_at,
    coalesce(l.source, 'legacy-water'), 'compat:sharva_water_logs:' || l.id::text,
    case when l.amount_ml between 50 and 2000 then 'valid' else 'legacy_out_of_range' end,
    v.voided_at, v.reason, 'sharva_water_logs', l.id::text
  from public.sharva_water_logs l
  left join public.sharva_water_log_voids v on v.entry_id = l.id
  on conflict do nothing;
end;
$$;

comment on table public.pulse_logs is 'Canonical SharvaOS Pulse daily log store. Existing water tables are compatibility ingress only.';
comment on table public.pulse_todos is 'Canonical SharvaOS Pulse task store.';
comment on table public.pulse_mutation_receipts is 'Idempotent mutation evidence for SharvaOS Pulse writes.';
comment on function public.pulse_apply_mutation(date, text, text, jsonb) is 'Authenticated owner-only canonical mutation boundary with read-back confirmation.';
