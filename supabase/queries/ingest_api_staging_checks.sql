-- Readings API go-live checks. READ-ONLY. Run in the SQL editor of the project the
-- API will write to (staging first). Every row should show ok = true.
-- Fixture checks (sections 2-3) need the ids of the ingestion account and its points.

-- 1. Schema and privileges
select 'create_manual_reading has current/voltage (#134)' as check_name,
       to_regprocedure('public.create_manual_reading(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric)') is not null as ok
union all
select 'ingest_reading_v1 exists',
       to_regprocedure('public.ingest_reading_v1(jsonb)') is not null
union all
select 'ingest_reading_v1 is the 29 Oct version (current/voltage + limits)',
       coalesce(pg_get_functiondef('public.ingest_reading_v1(jsonb)'::regprocedure) like '%current_a%', false)
union all
select 'anon cannot execute ingest_reading_v1',
       not has_function_privilege('anon', 'public.ingest_reading_v1(jsonb)', 'execute')
union all
select 'authenticated can execute ingest_reading_v1',
       has_function_privilege('authenticated', 'public.ingest_reading_v1(jsonb)', 'execute')
union all
select 'ingest_reading_v1 has an empty search_path',
       exists (select 1 from pg_proc
               where oid = 'public.ingest_reading_v1(jsonb)'::regprocedure
                 and proconfig @> array['search_path=""'])
union all
select 'power is calculated by trigger (#134)',
       exists (select 1 from pg_trigger where tgname = 'reading_batches_calculate_power' and not tgisinternal);

-- 2. The ingestion account: active, and the role you intend (engineer = assigned points only)
-- select id, email, role, is_active from public.users where email = '<ingestion account email>';

-- 3. Its scoped test points: active, correct type, assigned to it if it is an engineer
-- select id, label, type, is_active, assigned_engineer_id
-- from public.test_points
-- where id in ('<point uuid 1>', '<point uuid 2>');

-- 4. After a smoke test: the reading, its batch (power = V x I on variable points) and summaries
-- select r.id, r.value_mv, r.is_protected, b.reading_ts, b.upload_method, b.current_a, b.voltage_v, b.power_watts
-- from public.test_point_readings r join public.reading_batches b on b.id = r.batch_id
-- where r.id = '<reading_id returned by the API>';
