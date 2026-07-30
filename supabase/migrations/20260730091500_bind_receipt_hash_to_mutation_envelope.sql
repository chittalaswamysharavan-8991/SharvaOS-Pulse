do $$
declare
  v_definition text;
  v_old text := $old$v_payload_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');$old$;
  v_new text := $new$v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object('date', p_date, 'action', p_action, 'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');$new$;
begin
  if exists (select 1 from public.pulse_mutation_receipts) then
    raise exception 'Mutation-envelope hash migration requires an empty receipt table';
  end if;

  select pg_get_functiondef('public.pulse_apply_mutation(date,text,text,jsonb)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected payload-only hash statement was not found';
  end if;

  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('public.pulse_apply_mutation(date,text,text,jsonb)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition) = 0 then
    raise exception 'Mutation-envelope hash replacement could not be verified';
  end if;
end;
$$;

comment on column public.pulse_mutation_receipts.payload_hash is
  'SHA-256 of the canonical mutation envelope: date, action and payload.';
comment on function public.pulse_apply_mutation(date, text, text, jsonb) is
  'Authenticated owner-only canonical mutation boundary. Idempotency receipts bind date, action and payload before authoritative read-back.';
