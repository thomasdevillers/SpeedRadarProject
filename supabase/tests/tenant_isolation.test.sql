begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-a@example.test', '', now(), '{}', '{"name":"Viewer A"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-b@example.test', '', now(), '{}', '{"name":"Viewer B"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{"name":"Admin"}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-admin@example.test', '', now(), '{}', '{"name":"Client Admin"}', now(), now());

update public.profiles set platform_role = 'roadsafe_admin' where user_id = '10000000-0000-4000-8000-000000000003';
insert into public.organizations(id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b');
insert into public.organization_members(organization_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'client_viewer'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'client_viewer'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'client_admin');
insert into public.devices(id, serial_number, name) values
  ('30000000-0000-4000-8000-000000000001', 'TEST-A', 'RSR-TEST-A'),
  ('30000000-0000-4000-8000-000000000002', 'TEST-B', 'RSR-TEST-B'),
  ('30000000-0000-4000-8000-000000000003', 'TEST-C', 'RSR-TEST-C'),
  ('30000000-0000-4000-8000-000000000004', 'TEST-D', 'RSR-TEST-D');
insert into public.device_assignments(id, device_id, organization_id, site_name, speed_limit_kph, starts_at) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Site A', 60, now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Site B', 80, now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Site C', 60, now() - interval '1 day');
insert into public.radar_events(device_event_id, device_id, assignment_id, organization_id, captured_at, speed_kph, speed_limit_kph) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now(), 75, 60),
  ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now(), 92, 80);

select throws_ok(
  $$insert into public.device_assignments(device_id, organization_id, site_name, speed_limit_kph, starts_at) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Overlap', 60, now())$$,
  '23P01', null, 'a radar cannot have overlapping tenant assignments'
);

select is(has_function_privilege('authenticated', 'public.replace_device_assignment(uuid,uuid,text,integer,timestamptz,uuid,numeric,numeric)', 'EXECUTE'), false, 'assignment replacement is service-role only');
select is(has_function_privilege('authenticated', 'public.end_device_assignment(uuid,timestamptz)', 'EXECUTE'), false, 'assignment ending is service-role only');

create temporary table replacement_result as
select public.replace_device_assignment(
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000002',
  'Replacement site',
  80,
  now(),
  '10000000-0000-4000-8000-000000000003'
) as result;

select ok((select ends_at = now() from public.device_assignments where id = '40000000-0000-4000-8000-000000000003'), 'reassign closes the previous assignment at the switch time');
select is((select result ->> 'replaced' from replacement_result), 'true', 'reassign reports that it replaced an assignment');
select is((select organization_id from public.device_assignments where id = (select (result ->> 'id')::uuid from replacement_result)), '20000000-0000-4000-8000-000000000002'::uuid, 'reassign creates the new tenant assignment');

create temporary table scheduled_result as
select public.replace_device_assignment(
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  'Future site',
  100,
  now() + interval '1 hour',
  '10000000-0000-4000-8000-000000000003'
) as result;

select ok(exists(select 1 from public.device_assignments where id = (select (result ->> 'id')::uuid from scheduled_result) and starts_at > now()), 'a future reassign is scheduled without overlap');

create temporary table cancellation_result as
select public.end_device_assignment((select (result ->> 'id')::uuid from scheduled_result), now()) as result;

select is((select result ->> 'action' from cancellation_result), 'cancelled', 'ending a future assignment cancels it');
select ok(exists(select 1 from public.device_assignments where id = (select (result ->> 'id')::uuid from replacement_result) and ends_at is null), 'cancelling a future assignment restores the preceding assignment');

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
select is(has_function_privilege('authenticated', 'public.update_device_speed_limit(uuid,integer)', 'EXECUTE'), true, 'authenticated users can call the guarded speed limit transaction');

select throws_ok(
  $$select public.update_device_speed_limit('30000000-0000-4000-8000-000000000001', 70)$$,
  '42501', 'You cannot change the speed limit for this radar', 'client viewer cannot change a radar speed limit'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((public.update_device_speed_limit('30000000-0000-4000-8000-000000000001', 70) ->> 'speedLimitKph')::integer, 70, 'client admin can change its assigned radar limit');
select is((select speed_limit_kph from public.device_assignments where id = '40000000-0000-4000-8000-000000000001'), 70, 'the active assignment stores the new speed limit');
reset role;
select ok(exists(select 1 from public.device_commands where device_id = '30000000-0000-4000-8000-000000000001' and command_type = 'sync_config'), 'a speed limit change queues a config sync');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::integer from public.radar_events), 2, 'RoadSafe admin sees all tenant events');
select is(public.update_device_speed_limit('30000000-0000-4000-8000-000000000004', 100) ->> 'source', 'device_default', 'RoadSafe admin can change an unassigned radar default');
select is((select default_speed_limit_kph from public.devices where id = '30000000-0000-4000-8000-000000000004'), 100, 'the unassigned radar stores its new default limit');

select * from finish();
rollback;
