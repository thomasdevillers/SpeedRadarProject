create or replace function public.replace_device_assignment(
  p_device_id uuid,
  p_organization_id uuid,
  p_site_name text,
  p_speed_limit_kph integer,
  p_starts_at timestamptz,
  p_created_by uuid,
  p_latitude numeric default null,
  p_longitude numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.device_assignments;
  v_replaced_count integer;
begin
  perform 1 from public.devices where id = p_device_id for update;
  if not found then
    raise exception 'Radar not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.organizations where id = p_organization_id and status = 'active') then
    raise exception 'Active client not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.device_assignments a
    where a.device_id = p_device_id
      and a.starts_at >= p_starts_at
      and exists (select 1 from public.radar_events e where e.assignment_id = a.id)
  ) then
    raise exception 'A future assignment with recorded events cannot be replaced' using errcode = 'P0001';
  end if;

  delete from public.device_assignments a
  where a.device_id = p_device_id
    and a.starts_at >= p_starts_at
    and not exists (select 1 from public.radar_events e where e.assignment_id = a.id);

  update public.device_assignments
  set ends_at = p_starts_at
  where device_id = p_device_id
    and starts_at < p_starts_at
    and (ends_at is null or ends_at > p_starts_at);
  get diagnostics v_replaced_count = row_count;

  insert into public.device_assignments(
    device_id,
    organization_id,
    site_name,
    latitude,
    longitude,
    speed_limit_kph,
    starts_at,
    created_by
  )
  values (
    p_device_id,
    p_organization_id,
    p_site_name,
    p_latitude,
    p_longitude,
    p_speed_limit_kph,
    p_starts_at,
    p_created_by
  )
  returning * into v_assignment;

  return jsonb_build_object(
    'id', v_assignment.id,
    'deviceId', v_assignment.device_id,
    'organizationId', v_assignment.organization_id,
    'startsAt', v_assignment.starts_at,
    'replaced', v_replaced_count > 0
  );
end;
$$;

create or replace function public.end_device_assignment(
  p_assignment_id uuid,
  p_ended_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.device_assignments;
  v_next_start timestamptz;
  v_action text;
begin
  select *
  into v_assignment
  from public.device_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  perform 1 from public.devices where id = v_assignment.device_id for update;

  if v_assignment.starts_at > p_ended_at then
    if exists (select 1 from public.radar_events where assignment_id = p_assignment_id) then
      raise exception 'A scheduled assignment with recorded events cannot be cancelled' using errcode = 'P0001';
    end if;

    delete from public.device_assignments where id = p_assignment_id;

    select min(starts_at)
    into v_next_start
    from public.device_assignments
    where device_id = v_assignment.device_id
      and starts_at > v_assignment.starts_at;

    update public.device_assignments
    set ends_at = v_next_start
    where device_id = v_assignment.device_id
      and ends_at = v_assignment.starts_at;

    v_action := 'cancelled';
  elsif v_assignment.ends_at is null or v_assignment.ends_at > p_ended_at then
    update public.device_assignments
    set ends_at = greatest(p_ended_at, v_assignment.starts_at + interval '1 second')
    where id = p_assignment_id;
    v_action := 'ended';
  else
    v_action := 'unchanged';
  end if;

  return jsonb_build_object(
    'id', p_assignment_id,
    'deviceId', v_assignment.device_id,
    'organizationId', v_assignment.organization_id,
    'action', v_action
  );
end;
$$;

revoke all on function public.replace_device_assignment(uuid, uuid, text, integer, timestamptz, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.end_device_assignment(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_device_assignment(uuid, uuid, text, integer, timestamptz, uuid, numeric, numeric) to service_role;
grant execute on function public.end_device_assignment(uuid, timestamptz) to service_role;
