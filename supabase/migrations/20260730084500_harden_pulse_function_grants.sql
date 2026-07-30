revoke all on function public.pulse_mirror_legacy_water_insert() from public, anon, authenticated;
revoke all on function public.pulse_mirror_legacy_water_void() from public, anon, authenticated;

comment on function public.pulse_mirror_legacy_water_insert() is
  'Trigger-only compatibility mirror. Direct execution is revoked.';
comment on function public.pulse_mirror_legacy_water_void() is
  'Trigger-only compatibility void mirror. Direct execution is revoked.';
