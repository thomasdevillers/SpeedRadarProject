set search_path = public, extensions;
create schema if not exists pgmq;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgmq with schema pgmq;

create type public.organization_status as enum ('active', 'suspended');
create type public.member_role as enum ('roadsafe_admin', 'client_admin', 'client_viewer');
create type public.device_state as enum ('online', 'degraded', 'offline', 'unassigned');
create type public.photo_status as enum ('not_required', 'pending', 'uploaded', 'failed', 'disk_full');
create type public.processing_status as enum ('not_required', 'pending', 'processing', 'complete', 'failed');
create type public.email_status as enum ('not_required', 'pending', 'sent', 'delivered', 'bounced', 'failed');
create type public.command_type as enum ('restart_radar', 'reboot_device', 'capture_test', 'sync_config', 'upload_diagnostics', 'deploy_release');
create type public.command_status as enum ('pending', 'delivered', 'running', 'completed', 'failed', 'expired');
create type public.deployment_status as enum ('pending', 'downloading', 'verifying', 'installing', 'healthy', 'failed', 'rolled_back');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.organization_status not null default 'active',
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_internal_organization on public.organizations (is_internal) where is_internal;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  platform_role public.member_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform_role is null or platform_role = 'roadsafe_admin')
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null check (role <> 'roadsafe_admin'),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  name text not null unique,
  state public.device_state not null default 'unassigned',
  hardware_model text,
  operating_system text,
  software_version text not null default 'unprovisioned',
  desired_version text,
  default_speed_limit_kph integer not null default 60 check (default_speed_limit_kph between 10 and 180),
  last_seen_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  secret_hash text not null,
  label text not null default 'primary',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_active_device_credential on public.device_credentials(device_id) where revoked_at is null;

create table public.device_activation_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.device_assignments (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  site_name text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  speed_limit_kph integer not null check (speed_limit_kph between 10 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  exclude using gist (device_id with =, tstzrange(starts_at, coalesce(ends_at, 'infinity'::timestamptz), '[)') with &&)
);
create index device_assignments_org_idx on public.device_assignments(organization_id, starts_at desc);

create table public.radar_events (
  id uuid primary key default gen_random_uuid(),
  device_event_id uuid not null,
  device_id uuid not null references public.devices(id) on delete restrict,
  assignment_id uuid references public.device_assignments(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete restrict,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  speed_kph integer not null check (speed_kph between 0 and 300),
  speed_limit_kph integer not null check (speed_limit_kph between 10 and 180),
  overspeed_kph integer generated always as (greatest(0, speed_kph - speed_limit_kph)) stored,
  direction_code text not null default 'A' check (direction_code in ('A', 'R')),
  photo_path text,
  photo_status public.photo_status not null default 'not_required',
  processing_status public.processing_status not null default 'not_required',
  plate text,
  plate_region text,
  plate_score numeric(5,4),
  plate_dscore numeric(5,4),
  plate_box jsonb,
  ocr_attempts integer not null default 0,
  ocr_error text,
  email_status public.email_status not null default 'not_required',
  email_message_id text,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(device_id, device_event_id),
  check ((photo_path is null and photo_status in ('not_required', 'failed', 'disk_full')) or photo_path is not null)
);
create index radar_events_org_time_idx on public.radar_events(organization_id, captured_at desc);
create index radar_events_device_time_idx on public.radar_events(device_id, captured_at desc);
create index radar_events_processing_idx on public.radar_events(processing_status) where processing_status in ('pending', 'processing', 'failed');

create table public.device_heartbeats (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  radar_connected boolean not null,
  camera_connected boolean not null,
  radar_service_active boolean not null,
  cpu_temperature_c numeric(5,2),
  memory_used_percent numeric(5,2),
  disk_used_percent numeric(5,2),
  queue_depth integer not null default 0,
  last_radar_message_at timestamptz,
  last_camera_success_at timestamptz,
  last_error text,
  tailscale_ip inet,
  software_version text not null,
  uptime_seconds bigint
);
create index device_heartbeats_latest_idx on public.device_heartbeats(device_id, recorded_at desc);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  display_name text,
  enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id, email)
);

create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  command_type public.command_type not null,
  payload jsonb not null default '{}'::jsonb,
  status public.command_status not null default 'pending',
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  result jsonb,
  error text
);
create index device_commands_pending_idx on public.device_commands(device_id, requested_at) where status in ('pending', 'delivered', 'running');

create table public.device_releases (
  version text primary key,
  bundle_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  signature text not null,
  manifest jsonb not null,
  release_notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.device_deployments (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  version text not null references public.device_releases(version) on delete restrict,
  status public.deployment_status not null default 'pending',
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  previous_version text,
  error text,
  unique(device_id, version, requested_at)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.daily_device_stats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  day date not null,
  total_vehicles integer not null,
  overspeed_vehicles integer not null,
  average_speed_kph numeric(6,2),
  maximum_speed_kph integer,
  primary key (organization_id, device_id, day)
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger devices_updated_at before update on public.devices for each row execute function public.set_updated_at();
create trigger radar_events_updated_at before update on public.radar_events for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name, email) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), coalesce(lower(new.email), ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_roadsafe_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where user_id = auth.uid() and platform_role = 'roadsafe_admin');
$$;

create or replace function public.is_organization_member(p_organization_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members where user_id = auth.uid() and organization_id = p_organization_id);
$$;

create or replace function public.is_organization_admin(p_organization_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_roadsafe_admin() or exists(select 1 from public.organization_members where user_id = auth.uid() and organization_id = p_organization_id and role = 'client_admin');
$$;

create or replace function public.shares_organization_with(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.organization_members mine
    join public.organization_members target on target.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and target.user_id = p_user_id
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.device_activation_tokens enable row level security;
alter table public.device_assignments enable row level security;
alter table public.radar_events enable row level security;
alter table public.device_heartbeats enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_releases enable row level security;
alter table public.device_deployments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.daily_device_stats enable row level security;

create policy organizations_select on public.organizations for select using (public.is_roadsafe_admin() or public.is_organization_member(id));
create policy profiles_select on public.profiles for select using (public.is_roadsafe_admin() or user_id = auth.uid() or public.shares_organization_with(user_id));
create policy members_select on public.organization_members for select using (public.is_roadsafe_admin() or public.is_organization_member(organization_id));
create policy devices_select on public.devices for select using (
  public.is_roadsafe_admin() or exists (
    select 1 from public.device_assignments a
    where a.device_id = devices.id and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()) and public.is_organization_member(a.organization_id)
  )
);
create policy assignments_select on public.device_assignments for select using (public.is_roadsafe_admin() or public.is_organization_member(organization_id));
create policy events_select on public.radar_events for select using (public.is_roadsafe_admin() or (organization_id is not null and public.is_organization_member(organization_id)));
create policy heartbeats_select on public.device_heartbeats for select using (
  public.is_roadsafe_admin() or exists (
    select 1 from public.device_assignments a where a.device_id = device_heartbeats.device_id and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()) and public.is_organization_member(a.organization_id)
  )
);
create policy recipients_select on public.notification_recipients for select using (public.is_organization_member(organization_id) or public.is_roadsafe_admin());
create policy recipients_insert on public.notification_recipients for insert with check (public.is_organization_admin(organization_id));
create policy recipients_update on public.notification_recipients for update using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy recipients_delete on public.notification_recipients for delete using (public.is_organization_admin(organization_id));
create policy commands_admin on public.device_commands for select using (public.is_roadsafe_admin());
create policy releases_admin on public.device_releases for select using (public.is_roadsafe_admin());
create policy deployments_admin on public.device_deployments for select using (public.is_roadsafe_admin());
create policy audit_admin on public.audit_logs for select using (public.is_roadsafe_admin());
create policy daily_stats_select on public.daily_device_stats for select using (public.is_roadsafe_admin() or public.is_organization_member(organization_id));

grant usage on schema public to authenticated;
grant select on table
  public.organizations,
  public.profiles,
  public.organization_members,
  public.devices,
  public.device_assignments,
  public.radar_events,
  public.device_heartbeats,
  public.notification_recipients,
  public.device_commands,
  public.device_releases,
  public.device_deployments,
  public.audit_logs,
  public.daily_device_stats
to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('radar-photos', 'radar-photos', false, 15728640, array['image/jpeg']), ('device-releases', 'device-releases', false, 104857600, array['application/gzip', 'application/x-gzip', 'application/octet-stream'])
on conflict (id) do nothing;

create or replace function public.can_read_radar_photo(p_name text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_part text; v_org uuid;
begin
  v_part := split_part(p_name, '/', 2);
  if v_part = 'unassigned' then return public.is_roadsafe_admin(); end if;
  begin v_org := v_part::uuid; exception when invalid_text_representation then return false; end;
  return public.is_roadsafe_admin() or public.is_organization_member(v_org);
end;
$$;
create policy radar_photos_select on storage.objects for select to authenticated using (bucket_id = 'radar-photos' and public.can_read_radar_photo(name));
create policy releases_select on storage.objects for select to authenticated using (bucket_id = 'device-releases' and public.is_roadsafe_admin());

create or replace function public.get_my_context() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile public.profiles; v_membership record; v_internal_id uuid;
begin
  select * into v_profile from public.profiles where user_id = auth.uid();
  if v_profile.platform_role = 'roadsafe_admin' then
    select id into v_internal_id from public.organizations where is_internal limit 1;
    return jsonb_build_object('displayName', v_profile.display_name, 'role', 'roadsafe_admin', 'organizationId', v_internal_id, 'organizationName', 'RoadSafe Operations');
  end if;
  select m.role, o.id organization_id, o.name into v_membership from public.organization_members m join public.organizations o on o.id = m.organization_id where m.user_id = auth.uid() and o.status = 'active' order by m.created_at limit 1;
  return jsonb_build_object('displayName', v_profile.display_name, 'role', coalesce(v_membership.role::text, 'client_viewer'), 'organizationId', v_membership.organization_id, 'organizationName', coalesce(v_membership.name, 'RoadSafe'));
end;
$$;

create or replace function public.replace_notification_recipients(p_organization_id uuid, p_emails text[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_organization_admin(p_organization_id) then raise exception 'client administrator access required' using errcode = '42501'; end if;
  delete from public.notification_recipients where organization_id = p_organization_id;
  insert into public.notification_recipients(organization_id, email, created_by)
  select p_organization_id, lower(trim(email)), auth.uid() from unnest(p_emails) email where trim(email) <> '' group by lower(trim(email));
end;
$$;

create or replace function public.get_event_feed(p_limit integer default 200, p_offset integer default 0) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'deviceEventId', e.device_event_id, 'deviceId', e.device_id, 'deviceName', d.name,
    'organizationName', o.name, 'siteName', coalesce(a.site_name, 'Unassigned'), 'capturedAt', e.captured_at,
    'speedKph', e.speed_kph, 'speedLimitKph', e.speed_limit_kph, 'overspeedKph', e.overspeed_kph,
    'plate', e.plate, 'plateRegion', e.plate_region, 'plateScore', e.plate_score, 'plateBox', e.plate_box,
    'photoPath', e.photo_path, 'photoStatus', e.photo_status, 'processingStatus', e.processing_status, 'emailStatus', e.email_status
  ) order by e.captured_at desc), '[]'::jsonb)
  from (select * from public.radar_events order by captured_at desc limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0)) e
  join public.devices d on d.id = e.device_id left join public.organizations o on o.id = e.organization_id left join public.device_assignments a on a.id = e.assignment_id;
$$;

create or replace function public.get_event_by_id(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'deviceEventId', e.device_event_id, 'deviceId', e.device_id, 'deviceName', d.name,
    'organizationName', o.name, 'siteName', coalesce(a.site_name, 'Unassigned'), 'capturedAt', e.captured_at,
    'speedKph', e.speed_kph, 'speedLimitKph', e.speed_limit_kph, 'overspeedKph', e.overspeed_kph,
    'plate', e.plate, 'plateRegion', e.plate_region, 'plateScore', e.plate_score, 'plateBox', e.plate_box,
    'photoPath', e.photo_path, 'photoStatus', e.photo_status, 'processingStatus', e.processing_status, 'emailStatus', e.email_status
  )
  from public.radar_events e join public.devices d on d.id = e.device_id
  left join public.organizations o on o.id = e.organization_id left join public.device_assignments a on a.id = e.assignment_id
  where e.id = p_id;
$$;

create or replace function public.get_organization_summaries() returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'status', o.status, 'memberCount', (select count(*) from public.organization_members m where m.organization_id = o.id), 'deviceCount', (select count(*) from public.device_assignments a where a.organization_id = o.id and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()))) order by o.name), '[]'::jsonb) from public.organizations o;
$$;

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
  select coalesce(jsonb_agg(jsonb_build_object('hour', to_char(hour_bucket, 'HH24'), 'vehicles', vehicles, 'overspeed', overspeed) order by hour_bucket), '[]'::jsonb) into v_hourly from (
    select date_trunc('hour', captured_at) hour_bucket, count(*) vehicles, count(*) filter (where overspeed_kph > 0) overspeed from public.radar_events where captured_at >= date_trunc('day', now()) group by 1
  ) x;
  return jsonb_build_object('organizationName', v_context ->> 'organizationName', 'role', v_context ->> 'role', 'metrics', v_metrics, 'devices', v_devices, 'recentEvents', v_events, 'hourlyTraffic', v_hourly);
end;
$$;

create or replace function public.refresh_daily_device_stats(p_day date default current_date - 1) returns void language sql security definer set search_path = '' as $$
  insert into public.daily_device_stats(organization_id, device_id, day, total_vehicles, overspeed_vehicles, average_speed_kph, maximum_speed_kph)
  select organization_id, device_id, p_day, count(*), count(*) filter (where overspeed_kph > 0), avg(speed_kph), max(speed_kph)
  from public.radar_events where organization_id is not null and captured_at >= p_day::timestamptz and captured_at < (p_day + 1)::timestamptz group by organization_id, device_id
  on conflict (organization_id, device_id, day) do update set total_vehicles = excluded.total_vehicles, overspeed_vehicles = excluded.overspeed_vehicles, average_speed_kph = excluded.average_speed_kph, maximum_speed_kph = excluded.maximum_speed_kph;
$$;

create or replace function public.activate_device(
  p_activation_token_id uuid,
  p_device_id uuid,
  p_secret_hash text,
  p_hardware_model text,
  p_operating_system text,
  p_software_version text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_claimed_id uuid;
begin
  update public.device_activation_tokens
  set used_at = now()
  where id = p_activation_token_id and device_id = p_device_id and used_at is null and expires_at > now()
  returning id into v_claimed_id;
  if v_claimed_id is null then
    raise exception 'activation token is invalid or expired' using errcode = 'P0001';
  end if;
  update public.device_credentials set revoked_at = now() where device_id = p_device_id and revoked_at is null;
  insert into public.device_credentials(device_id, secret_hash, label) values (p_device_id, p_secret_hash, 'primary');
  update public.devices set activated_at = now(), hardware_model = p_hardware_model, operating_system = p_operating_system, software_version = p_software_version, state = 'offline' where id = p_device_id;
end;
$$;

do $$ begin perform pgmq.create('event_processing'); exception when others then if sqlerrm not like '%already exists%' then raise; end if; end $$;
create or replace function public.enqueue_event_processing(p_event_id uuid) returns bigint language sql security definer set search_path = '' as $$ select pgmq.send('event_processing', jsonb_build_object('event_id', p_event_id)); $$;
create or replace function public.dequeue_event_processing() returns table(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb) language sql security definer set search_path = '' as $$ select q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message from pgmq.read('event_processing', 120, 5) q; $$;
create or replace function public.complete_event_processing(p_msg_id bigint) returns boolean language sql security definer set search_path = '' as $$ select pgmq.archive('event_processing', p_msg_id); $$;

revoke all on function public.enqueue_event_processing(uuid) from public, anon, authenticated;
revoke all on function public.dequeue_event_processing() from public, anon, authenticated;
revoke all on function public.complete_event_processing(bigint) from public, anon, authenticated;
revoke all on function public.activate_device(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.refresh_daily_device_stats(date) from public, anon, authenticated;
grant execute on function public.enqueue_event_processing(uuid) to service_role;
grant execute on function public.dequeue_event_processing() to service_role;
grant execute on function public.complete_event_processing(bigint) to service_role;
grant execute on function public.activate_device(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.refresh_daily_device_stats(date) to service_role;
revoke all on function public.get_my_context() from public, anon;
revoke all on function public.get_event_feed(integer, integer) from public, anon;
revoke all on function public.get_event_by_id(uuid) from public, anon;
revoke all on function public.get_organization_summaries() from public, anon;
revoke all on function public.get_dashboard_payload(integer) from public, anon;
revoke all on function public.replace_notification_recipients(uuid, text[]) from public, anon;
grant execute on function public.get_my_context() to authenticated;
grant execute on function public.get_event_feed(integer, integer) to authenticated;
grant execute on function public.get_event_by_id(uuid) to authenticated;
grant execute on function public.get_organization_summaries() to authenticated;
grant execute on function public.get_dashboard_payload(integer) to authenticated;
grant execute on function public.replace_notification_recipients(uuid, text[]) to authenticated;
