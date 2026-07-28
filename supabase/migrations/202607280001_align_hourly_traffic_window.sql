create or replace function public.get_dashboard_payload(p_days integer default 1) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_start timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90))); v_context jsonb; v_events jsonb; v_devices jsonb; v_hourly jsonb; v_metrics jsonb;
begin
  v_context := public.get_my_context();
  v_events := public.get_event_feed(20, 0);
  select jsonb_build_object(
    'totalVehicles', count(*), 'overspeedVehicles', count(*) filter (where overspeed_kph > 0),
    'overspeedRate', coalesce(round((count(*) filter (where overspeed_kph > 0))::numeric * 100 / nullif(count(*), 0), 1), 0),
    'averageSpeedKph', coalesce(round(avg(speed_kph)), 0), 'maximumSpeedKph', coalesce(max(speed_kph), 0),
    'onlineDevices', (select count(*) from public.devices where last_seen_at > now() - interval '3 minutes'),
    'totalDevices', (select count(*) from public.devices)
  ) into v_metrics from public.radar_events where captured_at >= v_start;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'serialNumber', d.serial_number, 'name', d.name,
    'state', case when d.last_seen_at > now() - interval '3 minutes' then 'online' else d.state::text end,
    'organizationName', o.name, 'siteName', coalesce(a.site_name, 'Unassigned'), 'speedLimitKph', coalesce(a.speed_limit_kph, d.default_speed_limit_kph),
    'lastSeenAt', d.last_seen_at, 'softwareVersion', d.software_version,
    'radarConnected', coalesce(h.radar_connected, false), 'cameraConnected', coalesce(h.camera_connected, false),
    'cpuTemperatureC', h.cpu_temperature_c, 'diskUsedPercent', h.disk_used_percent, 'queueDepth', coalesce(h.queue_depth, 0)
  ) order by d.name), '[]'::jsonb) into v_devices
  from public.devices d left join lateral (select * from public.device_assignments x where x.device_id = d.id and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now()) order by x.starts_at desc limit 1) a on true
  left join public.organizations o on o.id = a.organization_id left join lateral (select * from public.device_heartbeats x where x.device_id = d.id order by x.recorded_at desc limit 1) h on true;
  select coalesce(jsonb_agg(jsonb_build_object('hour', to_char(hour_bucket, 'HH24'), 'vehicles', vehicles, 'overspeed', overspeed) order by hour_bucket), '[]'::jsonb)
  into v_hourly
  from (
    select *
    from (
      select date_trunc('hour', captured_at) hour_bucket, count(*) vehicles, count(*) filter (where overspeed_kph > 0) overspeed
      from public.radar_events
      where captured_at >= v_start
      group by 1
      order by hour_bucket desc
      limit 8
    ) latest_hours
    order by hour_bucket
  ) x;
  return jsonb_build_object('organizationName', v_context ->> 'organizationName', 'role', v_context ->> 'role', 'metrics', v_metrics, 'devices', v_devices, 'recentEvents', v_events, 'hourlyTraffic', v_hourly);
end;
$$;
