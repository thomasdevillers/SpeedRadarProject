begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{}', '{"name":"Viewer A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-b@example.test', '', now(), '{}', '{"name":"Viewer B"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{"name":"Admin"}', now(), now());

update public.profiles set platform_role = 'roadsafe_admin' where user_id = '10000000-0000-4000-8000-000000000003';
insert into public.organizations(id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b');
insert into public.organization_members(organization_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'client_viewer'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'client_viewer');
insert into public.devices(id, serial_number, name) values
  ('30000000-0000-4000-8000-000000000001', 'TEST-A', 'RSR-TEST-A'),
  ('30000000-0000-4000-8000-000000000002', 'TEST-B', 'RSR-TEST-B');
insert into public.device_assignments(id, device_id, organization_id, site_name, speed_limit_kph, starts_at) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Site A', 60, now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Site B', 80, now() - interval '1 day');
insert into public.radar_events(device_event_id, device_id, assignment_id, organization_id, captured_at, speed_kph, speed_limit_kph) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now(), 75, 60),
  ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now(), 92, 80);

select throws_ok(
  $$insert into public.device_assignments(device_id, organization_id, site_name, speed_limit_kph, starts_at) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Overlap', 60, now())$$,
  '23P01', null, 'a radar cannot have overlapping tenant assignments'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::integer from public.radar_events), 1, 'viewer sees only its tenant events');
select is((select count(*)::integer from public.devices), 1, 'viewer sees only its assigned radar');
select is((select count(*)::integer from public.organizations), 1, 'viewer sees only its organisation');
select is(jsonb_array_length(public.get_event_feed(20, 0)), 1, 'event RPC preserves tenant RLS');
select is(public.is_organization_admin('20000000-0000-4000-8000-000000000001'), false, 'client viewer cannot administer recipients');
select is(public.can_read_radar_photo('raw/20000000-0000-4000-8000-000000000001/device/photo.jpg'), true, 'viewer can read its tenant photos');
select is(public.can_read_radar_photo('raw/20000000-0000-4000-8000-000000000002/device/photo.jpg'), false, 'viewer cannot read another tenant photos');
select is(has_function_privilege('authenticated', 'public.activate_device(uuid,uuid,text,text,text,text)', 'EXECUTE'), false, 'activation transaction is service-role only');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::integer from public.radar_events), 2, 'RoadSafe admin sees all tenant events');

select * from finish();
rollback;
