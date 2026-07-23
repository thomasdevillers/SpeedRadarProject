create or replace function public.update_device_speed_limit(
  p_device_id uuid,
  p_speed_limit_kph integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.device_assignments;
  v_is_roadsafe_admin boolean := public.is_roadsafe_admin();
  v_actor uuid := auth.uid();
  v_source text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_speed_limit_kph < 10 or p_speed_limit_kph > 180 then
    raise exception 'Speed limit must be between 10 and 180 km/h' using errcode = '23514';
  end if;

  select *
  into v_assignment
  from public.device_assignments
  where device_id = p_device_id
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by starts_at desc
  limit 1
  for update;

  if found then
    if not v_is_roadsafe_admin and not exists (
      select 1
      from public.organization_members
      where user_id = v_actor
        and organization_id = v_assignment.organization_id
        and role = 'client_admin'
    ) then
      raise exception 'You cannot change the speed limit for this radar' using errcode = '42501';
    end if;

    update public.device_assignments
    set speed_limit_kph = p_speed_limit_kph
    where id = v_assignment.id;
    v_source := 'assignment';

    insert into public.audit_logs(
      actor_user_id, organization_id, device_id, action, target_type, target_id, details
    ) values (
      v_actor, v_assignment.organization_id, p_device_id, 'device.speed_limit_updated',
      'assignment', v_assignment.id,
      jsonb_build_object('speedLimitKph', p_speed_limit_kph)
    );
  else
    if not v_is_roadsafe_admin then
      raise exception 'This radar is not currently assigned to your organisation' using errcode = '42501';
    end if;

    update public.devices
    set default_speed_limit_kph = p_speed_limit_kph
    where id = p_device_id;
    if not found then
      raise exception 'Radar not found' using errcode = 'P0002';
    end if;
    v_source := 'device_default';

    insert into public.audit_logs(
      actor_user_id, device_id, action, target_type, target_id, details
    ) values (
      v_actor, p_device_id, 'device.speed_limit_updated',
      'device', p_device_id,
      jsonb_build_object('speedLimitKph', p_speed_limit_kph)
    );
  end if;

  insert into public.device_commands(device_id, command_type, requested_by)
  values (p_device_id, 'sync_config', v_actor);

  return jsonb_build_object(
    'deviceId', p_device_id,
    'speedLimitKph', p_speed_limit_kph,
    'source', v_source
  );
end;
$$;

revoke all on function public.update_device_speed_limit(uuid, integer) from public;
grant execute on function public.update_device_speed_limit(uuid, integer) to authenticated;
