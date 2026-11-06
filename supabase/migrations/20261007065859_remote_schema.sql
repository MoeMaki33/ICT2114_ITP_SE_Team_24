SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE EXTENSION "pg_cron";

CREATE TABLE "public"."backup_jalanban_reading_batches" (
  "id"                  uuid,
  "location_id"         uuid,
  "reading_ts"          timestamp with time zone,
  "entered_by"          uuid,
  "upload_method"       text,
  "temperature_c"       numeric(6,2),
  "medium_conductivity" numeric(10,2),
  "ph"                  numeric(4,2),
  "dissolved_oxygen"    numeric(6,2),
  "power_watts"         numeric(10,5),
  "source_file"         text,
  "created_at"          timestamp with time zone
);

ALTER TABLE "public"."backup_jalanban_reading_batches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."backup_jalanban_test_point_readings" (
  "id"                    uuid,
  "batch_id"              uuid,
  "test_point_id"         uuid,
  "value_mv"              integer,
  "threshold_mv_snapshot" integer,
  "is_protected"          boolean,
  "created_at"            timestamp with time zone
);

ALTER TABLE "public"."backup_jalanban_test_point_readings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."daily_summaries" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "test_point_id"            uuid                     NOT NULL,
  "summary_date"             date                     NOT NULL,
  "first_reading_mv"         integer,
  "latest_reading_mv"        integer,
  "daily_average_mv"         numeric,
  "minimum_reading_mv"       integer,
  "maximum_reading_mv"       integer,
  "reading_count"            integer                  NOT NULL DEFAULT 0,
  "protected_count"          integer                  NOT NULL DEFAULT 0,
  "unprotected_count"        integer                  NOT NULL DEFAULT 0,
  "protected_percentage"     numeric,
  "threshold_crossing_count" integer                  NOT NULL DEFAULT 0,
  "first_reading_ts"         timestamp with time zone,
  "latest_reading_ts"        timestamp with time zone,
  "average_temperature_c"    numeric,
  "average_conductivity"     numeric,
  "first_is_protected"       boolean,
  "latest_is_protected"      boolean,
  "generated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "daily_summaries_count_bounds" CHECK (((protected_count + unprotected_count) <= reading_count)),
  CONSTRAINT "daily_summaries_non_negative_counts" CHECK (((reading_count >= 0) AND (protected_count >= 0) AND (unprotected_count >= 0) AND (threshold_crossing_count >= 0))),
  CONSTRAINT "daily_summaries_pkey" PRIMARY KEY (id),
  CONSTRAINT "daily_summaries_protected_percentage_bounds"
    CHECK (((protected_percentage IS NULL) OR ((protected_percentage >= (0)::numeric) AND (protected_percentage <= (100)::numeric)))),
  CONSTRAINT "daily_summaries_test_point_date_unique" UNIQUE (test_point_id, summary_date)
);

ALTER TABLE "public"."daily_summaries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."dashboard_layouts" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "page_key"       text                     NOT NULL DEFAULT 'main-dashboard'::text,
  "dashboard_name" text                     NOT NULL DEFAULT 'Main Dashboard'::text,
  "layout_version" integer                  NOT NULL DEFAULT 1,
  "layout_config"  jsonb                    NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dashboard_layouts_config_check" CHECK ((jsonb_typeof(layout_config) = 'object'::text)),
  CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY (id),
  CONSTRAINT "dashboard_layouts_user_page_unique" UNIQUE (user_id, page_key)
);

ALTER TABLE "public"."dashboard_layouts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."dashboard_layouts" FROM "anon";

CREATE TABLE "public"."locations" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "site_name"   text                     NOT NULL,
  "latitude"    numeric(9,6),
  "longitude"   numeric(9,6),
  "description" text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "created_by"  uuid,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "locations_pkey" PRIMARY KEY (id),
  CONSTRAINT "locations_site_name_key" UNIQUE (site_name)
);

ALTER TABLE "public"."locations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reading_batches" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "location_id"         uuid                     NOT NULL,
  "reading_ts"          timestamp with time zone NOT NULL,
  "entered_by"          uuid,
  "upload_method"       text                     NOT NULL,
  "temperature_c"       numeric(6,2),
  "medium_conductivity" numeric(10,2),
  "ph"                  numeric(4,2),
  "dissolved_oxygen"    numeric(6,2),
  "power_watts"         numeric(10,5),
  "source_file"         text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reading_batches_pkey" PRIMARY KEY (id),
  CONSTRAINT "reading_batches_upload_method_check" CHECK ((upload_method = ANY (ARRAY['manual'::text, 'bulk'::text, 'sensor'::text])))
);

ALTER TABLE "public"."reading_batches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."summary_refresh_queue" (
  "test_point_id" uuid                     NOT NULL,
  "summary_date"  date                     NOT NULL,
  "requested_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "summary_refresh_queue_pkey" PRIMARY KEY (test_point_id, summary_date)
);

ALTER TABLE "public"."summary_refresh_queue"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."test_point_equipment_versions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "test_point_id" uuid                     NOT NULL,
  "version_no"    integer                  NOT NULL,
  "installed_at"  timestamp with time zone NOT NULL,
  "removed_at"    timestamp with time zone,
  "change_type"   text                     NOT NULL DEFAULT 'replacement'::text,
  "reason"        text,
  "notes"         text,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "test_point_equipment_versions_change_type_check"
    CHECK ((change_type = ANY (ARRAY['initial_install'::text, 'replacement'::text, 'upgrade'::text, 'repair'::text, 'calibration'::text]))),
  CONSTRAINT "test_point_equipment_versions_check" CHECK (((removed_at IS NULL) OR (removed_at >= installed_at))),
  CONSTRAINT "test_point_equipment_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "test_point_equipment_versions_test_point_id_version_no_key" UNIQUE (test_point_id, version_no)
);

ALTER TABLE "public"."test_point_equipment_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."test_point_positions" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "test_point_id"         uuid                     NOT NULL,
  "coordinate_mode"       text                     NOT NULL DEFAULT 'unmapped'::text,
  "latitude"              numeric,
  "longitude"             numeric,
  "relative_x_m"          numeric,
  "relative_y_m"          numeric,
  "relative_z_m"          numeric,
  "chainage_m"            numeric,
  "coordinate_accuracy_m" numeric,
  "coordinate_source"     text,
  "is_current"            boolean                  NOT NULL DEFAULT true,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"            uuid,
  "valid_from"            timestamp with time zone NOT NULL DEFAULT now(),
  "valid_to"              timestamp with time zone,
  CONSTRAINT "test_point_positions_coordinate_mode_check" CHECK ((coordinate_mode = ANY (ARRAY['gps'::text, 'relative'::text, 'gps_and_relative'::text, 'unmapped'::text]))),
  CONSTRAINT "test_point_positions_gps_modes_require_lat_lng" CHECK (((coordinate_mode <> ALL (ARRAY['gps'::text, 'gps_and_relative'::text])) OR ((latitude IS
    NOT NULL) AND (longitude IS NOT NULL)))),
  CONSTRAINT "test_point_positions_latitude_range" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
  CONSTRAINT "test_point_positions_longitude_range" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
  CONSTRAINT "test_point_positions_pkey" PRIMARY KEY (id),
  CONSTRAINT "test_point_positions_relative_modes_require_xy" CHECK (((coordinate_mode <> ALL (ARRAY['relative'::text, 'gps_and_relative'::text])) OR ((relative_x_m IS
    NOT NULL) AND (relative_y_m IS NOT NULL)))),
  CONSTRAINT "test_point_positions_validity_consistent" CHECK ((((is_current = true) AND (valid_to IS NULL)) OR ((is_current = false) AND (valid_to IS
    NOT NULL) AND (valid_to >= valid_from))))
);

ALTER TABLE "public"."test_point_positions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."test_point_readings" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "batch_id"              uuid                     NOT NULL,
  "test_point_id"         uuid                     NOT NULL,
  "value_mv"              integer                  NOT NULL,
  "threshold_mv_snapshot" integer                  NOT NULL DEFAULT '-850'::integer,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "test_point_readings_batch_id_test_point_id_key" UNIQUE (batch_id, test_point_id),
  CONSTRAINT "test_point_readings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."test_point_readings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."test_points" (
  "id"                           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "location_id"                  uuid                     NOT NULL,
  "label"                        text                     NOT NULL,
  "type"                         text                     NOT NULL DEFAULT 'stationary'::text,
  "threshold_mv"                 integer                  NOT NULL DEFAULT '-850'::integer,
  "status"                       text                     NOT NULL DEFAULT 'unknown'::text,
  "is_active"                    boolean                  NOT NULL DEFAULT true,
  "created_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "assigned_engineer_id"         uuid,
  "latitude"                     numeric,
  "longitude"                    numeric,
  "test_point_code"              text,
  "note"                         text,
  "current_equipment_version_id" uuid,
  CONSTRAINT "test_points_location_id_label_key" UNIQUE (location_id, label),
  CONSTRAINT "test_points_pkey" PRIMARY KEY (id),
  CONSTRAINT "test_points_status_check" CHECK ((status = ANY (ARRAY['protected'::text, 'unprotected'::text, 'unknown'::text]))),
  CONSTRAINT "test_points_test_point_code_key" UNIQUE (test_point_code),
  CONSTRAINT "test_points_type_check" CHECK ((type = ANY (ARRAY['stationary'::text, 'variable'::text])))
);

ALTER TABLE "public"."test_points"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."users" (
  "id"         uuid                     NOT NULL,
  "full_name"  text                     NOT NULL,
  "email"      text                     NOT NULL,
  "role"       text                     NOT NULL,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid,
  CONSTRAINT "app_users_email_key" UNIQUE (email),
  CONSTRAINT "app_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "app_users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'corrosion_engineer'::text])))
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."v_readings_backup_table" (
  "id"                    uuid,
  "reading_ts"            timestamp with time zone,
  "location_id"           uuid,
  "site_name"             text,
  "test_point_id"         uuid,
  "test_point_label"      text,
  "value_mv"              integer,
  "threshold_mv_snapshot" integer,
  "is_protected"          boolean,
  "temperature_c"         numeric(6,2),
  "medium_conductivity"   numeric(10,2),
  "ph"                    numeric(4,2),
  "dissolved_oxygen"      numeric(6,2),
  "power_watts"           numeric(10,5),
  "upload_method"         text,
  "entered_by"            uuid,
  "source_file"           text
);

ALTER TABLE "public"."v_readings_backup_table"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."weekly_summaries" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "test_point_id"            uuid                     NOT NULL,
  "week_start_date"          date                     NOT NULL,
  "week_end_date"            date                     NOT NULL,
  "latest_reading_mv"        integer,
  "weekly_average_mv"        numeric(10,2),
  "change_from_start_mv"     integer,
  "status_change"            text                     NOT NULL,
  "generated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "first_reading_mv"         integer,
  "reading_count"            integer                  NOT NULL DEFAULT 0,
  "protected_count"          integer                  NOT NULL DEFAULT 0,
  "unprotected_count"        integer                  NOT NULL DEFAULT 0,
  "protected_percentage"     numeric,
  "threshold_crossing_count" integer                  NOT NULL DEFAULT 0,
  "minimum_reading_mv"       integer,
  "maximum_reading_mv"       integer,
  "first_reading_ts"         timestamp with time zone,
  "latest_reading_ts"        timestamp with time zone,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "weekly_summaries_non_negative_counts" CHECK (((reading_count >= 0) AND (protected_count >= 0) AND (unprotected_count >= 0) AND (threshold_crossing_count >= 0))),
  CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY (id),
  CONSTRAINT "weekly_summaries_protected_percentage_bounds"
    CHECK (((protected_percentage IS NULL) OR ((protected_percentage >= (0)::numeric) AND (protected_percentage <= (100)::numeric)))),
  CONSTRAINT "weekly_summaries_status_change_check" CHECK ((status_change = ANY (ARRAY['improved'::text, 'declined'::text, 'stable'::text, 'insufficient_data'::text]))),
  CONSTRAINT "weekly_summaries_test_point_id_week_start_date_key" UNIQUE (test_point_id, week_start_date),
  CONSTRAINT "weekly_summaries_test_point_week_unique" UNIQUE (test_point_id, week_start_date, week_end_date)
);

ALTER TABLE "public"."weekly_summaries"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."test_point_readings"
  ADD COLUMN "is_protected" boolean GENERATED ALWAYS AS ((value_mv <= threshold_mv_snapshot)) STORED;

CREATE OR REPLACE FUNCTION public.backfill_daily_and_weekly_summaries (
  p_start_date          date,
  p_end_date            date,
  p_timezone            text    DEFAULT 'Asia/Singapore'::text,
  p_stable_tolerance_mv integer DEFAULT 5
)
  RETURNS TABLE (
    daily_rows_processed  integer,
    weekly_rows_processed integer,
    error_count           integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_daily record;
  v_weekly record;
  v_daily_count integer := 0;
  v_weekly_count integer := 0;
  v_errors integer := 0;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid start and end date are required.';
  end if;

  create temp table if not exists pg_temp.summary_backfill_weeks (
    test_point_id uuid not null,
    week_start_date date not null,
    primary key (test_point_id, week_start_date)
  ) on commit drop;

  truncate table pg_temp.summary_backfill_weeks;

  for v_daily in
    select distinct
      tpr.test_point_id,
      (rb.reading_ts at time zone p_timezone)::date as summary_date
    from public.test_point_readings tpr
    join public.reading_batches rb on rb.id = tpr.batch_id
    where tpr.value_mv is not null
      and (rb.reading_ts at time zone p_timezone)::date >= p_start_date
      and (rb.reading_ts at time zone p_timezone)::date <= p_end_date
    order by 1, 2
  loop
    begin
      perform public.refresh_daily_summary(v_daily.test_point_id, v_daily.summary_date, p_timezone);
      insert into pg_temp.summary_backfill_weeks (test_point_id, week_start_date)
      values (v_daily.test_point_id, public.summary_week_start(v_daily.summary_date))
      on conflict do nothing;
      v_daily_count := v_daily_count + 1;
    exception when others then
      v_errors := v_errors + 1;
      raise warning 'Daily backfill failed for test_point_id %, date %: %',
        v_daily.test_point_id,
        v_daily.summary_date,
        sqlerrm;
    end;
  end loop;

  for v_weekly in
    select test_point_id, week_start_date
    from pg_temp.summary_backfill_weeks
    order by 1, 2
  loop
    begin
      perform public.refresh_weekly_summary(v_weekly.test_point_id, v_weekly.week_start_date, p_stable_tolerance_mv);
      v_weekly_count := v_weekly_count + 1;
    exception when others then
      v_errors := v_errors + 1;
      raise warning 'Weekly backfill failed for test_point_id %, week %: %',
        v_weekly.test_point_id,
        v_weekly.week_start_date,
        sqlerrm;
    end;
  end loop;

  daily_rows_processed := v_daily_count;
  weekly_rows_processed := v_weekly_count;
  error_count := v_errors;
  return next;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."backfill_daily_and_weekly_summaries"(date, date, text, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.check_recent_reading_exists (
  p_test_point_id  uuid,
  p_reading_ts     timestamp with time zone,
  p_window_minutes integer                  DEFAULT 1
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   public.test_point_readings tpr
    JOIN   public.reading_batches rb ON rb.id = tpr.batch_id
    WHERE  tpr.test_point_id = p_test_point_id
    AND    rb.reading_ts BETWEEN
             p_reading_ts - (p_window_minutes || ' minutes')::INTERVAL
           AND
             p_reading_ts + (p_window_minutes || ' minutes')::INTERVAL
  );
$function$;

REVOKE ALL ON FUNCTION "public"."check_recent_reading_exists"(uuid, timestamp WITH time zone, integer) FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.compare_weekly_summaries (
  p_selected_week_start   date,
  p_comparison_week_start date,
  p_stable_tolerance_mv   integer DEFAULT 5
)
  RETURNS TABLE (
    test_point_id                uuid,
    selected_week_start_date     date,
    comparison_week_start_date   date,
    selected_weekly_average_mv   numeric,
    comparison_weekly_average_mv numeric,
    week_comparison_mv           numeric,
    comparison_status            text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    tp.id as test_point_id,
    p_selected_week_start as selected_week_start_date,
    p_comparison_week_start as comparison_week_start_date,
    selected.weekly_average_mv as selected_weekly_average_mv,
    comparison.weekly_average_mv as comparison_weekly_average_mv,
    case
      when selected.weekly_average_mv is null or comparison.weekly_average_mv is null then null
      else selected.weekly_average_mv - comparison.weekly_average_mv
    end as week_comparison_mv,
    case
      when selected.weekly_average_mv is null or comparison.weekly_average_mv is null then 'no_comparison_data'
      when (selected.weekly_average_mv - comparison.weekly_average_mv) < (-1 * abs(p_stable_tolerance_mv)) then 'better'
      when (selected.weekly_average_mv - comparison.weekly_average_mv) > abs(p_stable_tolerance_mv) then 'worse'
      else 'stable'
    end as comparison_status
  from public.test_points tp
  left join public.weekly_summaries selected
    on selected.test_point_id = tp.id
   and selected.week_start_date = p_selected_week_start
   and selected.week_end_date = p_selected_week_start + 6
  left join public.weekly_summaries comparison
    on comparison.test_point_id = tp.id
   and comparison.week_start_date = p_comparison_week_start
   and comparison.week_end_date = p_comparison_week_start + 6
  where tp.is_active = true
  order by tp.label;
$function$;

REVOKE ALL ON FUNCTION "public"."compare_weekly_summaries"(date, date, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.create_manual_reading (
  p_test_point_id       uuid,
  p_reading_ts          timestamp with time zone,
  p_value_mv            integer,
  p_temperature_c       numeric                  DEFAULT NULL::numeric,
  p_medium_conductivity numeric                  DEFAULT NULL::numeric,
  p_ph                  numeric                  DEFAULT NULL::numeric,
  p_dissolved_oxygen    numeric                  DEFAULT NULL::numeric,
  p_power_watts         numeric                  DEFAULT NULL::numeric
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_location_id  UUID;
  v_threshold_mv INTEGER;
  v_batch_id     UUID;
  v_reading_id   UUID;
  v_user_id      UUID := auth.uid();
BEGIN

  -- ── Duplicate guard ────────────────────────────────────────────────────────
  -- Rejects if any reading for this test point exists within ±1 minute of the
  -- submitted timestamp. This is the hard DB backstop — the JS already warns
  -- the engineer at 30 minutes, so reaching here means a genuine race condition
  -- or a direct API call bypassing the frontend.
  IF check_recent_reading_exists(p_test_point_id, p_reading_ts, 1) THEN
    RAISE EXCEPTION 'A reading for this test point was already recorded within the last minute. Please check the Data History before adding another.'
      USING ERRCODE = 'unique_violation';
  END IF;
  -- ── End duplicate guard ────────────────────────────────────────────────────

  -- Look up the test point's location and threshold
  SELECT location_id, threshold_mv
  INTO   v_location_id, v_threshold_mv
  FROM   public.test_points
  WHERE  id = p_test_point_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Test point % not found', p_test_point_id;
  END IF;

  -- Insert the reading batch
  INSERT INTO public.reading_batches (
    location_id,
    reading_ts,
    entered_by,
    upload_method,
    temperature_c,
    medium_conductivity,
    ph,
    dissolved_oxygen,
    power_watts
  ) VALUES (
    v_location_id,
    p_reading_ts,
    v_user_id,
    'manual',
    p_temperature_c,
    p_medium_conductivity,
    p_ph,
    p_dissolved_oxygen,
    p_power_watts
  )
  RETURNING id INTO v_batch_id;

  -- Insert the test point reading
  INSERT INTO public.test_point_readings (
    batch_id,
    test_point_id,
    value_mv,
    threshold_mv_snapshot
  ) VALUES (
    v_batch_id,
    p_test_point_id,
    p_value_mv,
    COALESCE(v_threshold_mv, -850)
  )
  RETURNING id INTO v_reading_id;

  RETURN v_reading_id;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."create_manual_reading"(uuid, timestamp WITH time zone, integer, numeric, numeric, numeric, numeric, numeric) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.current_user_is_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_active = true
  );
$function$;

REVOKE ALL ON FUNCTION "public"."current_user_is_active"() FROM "anon";

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$function$;

REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM "anon";

CREATE OR REPLACE FUNCTION public.get_asset_map_points()
  RETURNS TABLE (
    test_point_id          uuid,
    display_id             text,
    label                  text,
    type                   text,
    threshold_mv           numeric,
    location_id            uuid,
    site_name              text,
    location_latitude      numeric,
    location_longitude     numeric,
    position_id            uuid,
    coordinate_mode        text,
    latitude               numeric,
    longitude              numeric,
    relative_x_m           numeric,
    relative_y_m           numeric,
    relative_z_m           numeric,
    chainage_m             numeric,
    coordinate_accuracy_m  numeric,
    coordinate_source      text,
    position_updated_at    timestamp with time zone,
    latest_reading_mv      numeric,
    latest_reading_ts      timestamp with time zone,
    protection_status      text,
    display_status         text,
    assigned_engineer_id   uuid,
    assigned_engineer_name text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    tp.id,
    coalesce(nullif(tp.label, ''), tp.id::text),
    tp.label,
    tp.type,
    tp.threshold_mv::numeric,
    tp.location_id,
    l.site_name,
    l.latitude::numeric,
    l.longitude::numeric,
    tpp.id,
    coalesce(tpp.coordinate_mode, 'unmapped'),
    case when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.latitude end,
    case when tpp.coordinate_mode in ('gps', 'gps_and_relative') then tpp.longitude end,
    tpp.relative_x_m,
    tpp.relative_y_m,
    tpp.relative_z_m,
    tpp.chainage_m,
    tpp.coordinate_accuracy_m,
    tpp.coordinate_source,
    tpp.updated_at,
    latest.value_mv::numeric,
    latest.reading_ts,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= coalesce(tp.threshold_mv, -850) then 'Protected'
      else 'Unprotected'
    end,
    case
      when latest.value_mv is null then 'Unknown'
      when latest.value_mv <= coalesce(tp.threshold_mv, -850) then 'Protected'
      when latest.value_mv <= -800 then 'Warning'
      else 'Unprotected'
    end,
    tp.assigned_engineer_id,
    u.full_name
  from public.test_points tp
  left join public.locations l on l.id = tp.location_id
  left join public.test_point_positions tpp
    on tpp.test_point_id = tp.id and tpp.is_current = true
  left join public.users u on u.id = tp.assigned_engineer_id
  left join lateral (
    select tpr.value_mv, rb.reading_ts
    from public.test_point_readings tpr
    join public.reading_batches rb on rb.id = tpr.batch_id
    where tpr.test_point_id = tp.id
    order by rb.reading_ts desc nulls last, tpr.created_at desc nulls last
    limit 1
  ) latest on true
  where tp.is_active = true
  order by coalesce(nullif(tp.label, ''), tp.id::text);
$function$;

REVOKE ALL ON FUNCTION "public"."get_asset_map_points"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_test_point_daily_summaries (
  p_week_start date,
  p_timezone   text DEFAULT 'Asia/Singapore'::text
)
  RETURNS TABLE (
    test_point_id            uuid,
    test_point_code          text,
    test_point_label         text,
    location_id              uuid,
    site_name                text,
    reading_date             date,
    first_reading_mv         numeric,
    latest_reading_mv        numeric,
    daily_average_mv         numeric,
    minimum_reading_mv       numeric,
    maximum_reading_mv       numeric,
    reading_count            bigint,
    protected_count          bigint,
    unprotected_count        bigint,
    protected_percentage     numeric,
    threshold_crossing_count bigint,
    first_reading_ts         timestamp with time zone,
    latest_reading_ts        timestamp with time zone,
    average_temperature_c    numeric,
    average_conductivity     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with bounds as (
    select
      (p_week_start::timestamp at time zone p_timezone) as week_start_ts,
      ((p_week_start + 7)::timestamp at time zone p_timezone) as next_week_start_ts
  ),
  week_batches as materialized (
    select
      rb.id,
      rb.location_id,
      rb.reading_ts,
      rb.temperature_c,
      rb.medium_conductivity
    from public.reading_batches rb
    cross join bounds b
    where rb.reading_ts >= b.week_start_ts
      and rb.reading_ts < b.next_week_start_ts
  ),
  raw_readings as (
    select
      tp.id as test_point_id,
      tp.label as test_point_code,
      tp.label as test_point_label,
      tp.location_id,
      l.site_name,
      (wb.reading_ts at time zone p_timezone)::date as reading_date,
      wb.reading_ts,
      tpr.value_mv::numeric as value_mv,
      coalesce(tpr.threshold_mv_snapshot, tp.threshold_mv, -850)::numeric as threshold_mv,
      wb.temperature_c,
      wb.medium_conductivity
    from week_batches wb
    join public.test_point_readings tpr on tpr.batch_id = wb.id
    join public.test_points tp on tp.id = tpr.test_point_id
    left join public.locations l on l.id = tp.location_id
    where tp.is_active = true
      and tpr.value_mv is not null
  ),
  ordered as (
    select
      raw_readings.*,
      (value_mv <= threshold_mv) as is_protected,
      lag(value_mv <= threshold_mv) over (
        partition by test_point_id, reading_date
        order by reading_ts
      ) as previous_is_protected
    from raw_readings
  )
  select
    test_point_id,
    test_point_code,
    test_point_label,
    location_id,
    site_name,
    reading_date,
    (array_agg(value_mv order by reading_ts asc))[1] as first_reading_mv,
    (array_agg(value_mv order by reading_ts desc))[1] as latest_reading_mv,
    avg(value_mv) as daily_average_mv,
    min(value_mv) as minimum_reading_mv,
    max(value_mv) as maximum_reading_mv,
    count(*) as reading_count,
    count(*) filter (where is_protected) as protected_count,
    count(*) filter (where not is_protected) as unprotected_count,
    (count(*) filter (where is_protected)::numeric / nullif(count(*), 0)::numeric) * 100 as protected_percentage,
    count(*) filter (where previous_is_protected is not null and previous_is_protected <> is_protected) as threshold_crossing_count,
    min(reading_ts) as first_reading_ts,
    max(reading_ts) as latest_reading_ts,
    avg(temperature_c) as average_temperature_c,
    avg(medium_conductivity) as average_conductivity
  from ordered
  group by test_point_id, test_point_code, test_point_label, location_id, site_name, reading_date
  order by test_point_code, reading_date;
$function$;

REVOKE ALL ON FUNCTION "public"."get_test_point_daily_summaries"(date, text) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_test_point_daily_summaries (
  p_week_start     date,
  p_timezone       text   DEFAULT 'Asia/Singapore'::text,
  p_test_point_ids uuid[] DEFAULT NULL::uuid[]
)
  RETURNS TABLE (
    test_point_id            uuid,
    test_point_code          text,
    test_point_label         text,
    location_id              uuid,
    site_name                text,
    reading_date             date,
    first_reading_mv         integer,
    latest_reading_mv        integer,
    daily_average_mv         numeric,
    minimum_reading_mv       integer,
    maximum_reading_mv       integer,
    reading_count            integer,
    protected_count          integer,
    unprotected_count        integer,
    protected_percentage     numeric,
    threshold_crossing_count integer,
    first_reading_ts         timestamp with time zone,
    latest_reading_ts        timestamp with time zone,
    average_temperature_c    numeric,
    average_conductivity     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    ds.test_point_id,
    tp.label as test_point_code,
    tp.label as test_point_label,
    tp.location_id,
    l.site_name,
    ds.summary_date as reading_date,
    ds.first_reading_mv,
    ds.latest_reading_mv,
    ds.daily_average_mv,
    ds.minimum_reading_mv,
    ds.maximum_reading_mv,
    ds.reading_count,
    ds.protected_count,
    ds.unprotected_count,
    ds.protected_percentage,
    ds.threshold_crossing_count,
    ds.first_reading_ts,
    ds.latest_reading_ts,
    ds.average_temperature_c,
    ds.average_conductivity
  from public.daily_summaries ds
  join public.test_points tp on tp.id = ds.test_point_id
  left join public.locations l on l.id = tp.location_id
  where ds.summary_date >= p_week_start
    and ds.summary_date < p_week_start + 7
    and (p_test_point_ids is null or ds.test_point_id = any(p_test_point_ids))
  order by tp.label, ds.summary_date;
$function$;

REVOKE ALL ON FUNCTION "public"."get_test_point_daily_summaries"(date, text, uuid[]) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_test_point_position_history (
  p_test_point_id uuid
)
  RETURNS TABLE (
    id                    uuid,
    test_point_id         uuid,
    coordinate_mode       text,
    latitude              numeric,
    longitude             numeric,
    relative_x_m          numeric,
    relative_y_m          numeric,
    relative_z_m          numeric,
    chainage_m            numeric,
    coordinate_accuracy_m numeric,
    coordinate_source     text,
    is_current            boolean,
    valid_from            timestamp with time zone,
    valid_to              timestamp with time zone,
    created_at            timestamp with time zone,
    updated_at            timestamp with time zone,
    updated_by            uuid
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
      and lower(u.role::text) in ('admin', 'corrosion_engineer')
  ) then
    raise exception using errcode = '42501', message = 'An active Admin or Corrosion Engineer account is required.';
  end if;

  return query
  select
    p.id,
    p.test_point_id,
    p.coordinate_mode,
    p.latitude,
    p.longitude,
    p.relative_x_m,
    p.relative_y_m,
    p.relative_z_m,
    p.chainage_m,
    p.coordinate_accuracy_m,
    p.coordinate_source,
    p.is_current,
    p.valid_from,
    p.valid_to,
    p.created_at,
    p.updated_at,
    p.updated_by
  from public.test_point_positions p
  where p.test_point_id = p_test_point_id
  order by p.valid_from desc, p.created_at desc;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."get_test_point_position_history"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_test_point_weekly_summaries (
  p_week_start          date,
  p_timezone            text    DEFAULT 'Asia/Singapore'::text,
  p_stable_tolerance_mv integer DEFAULT 5
)
  RETURNS TABLE (
    test_point_id            uuid,
    test_point_code          text,
    test_point_label         text,
    threshold_mv             numeric,
    location_id              uuid,
    site_name                text,
    latitude                 numeric,
    longitude                numeric,
    assigned_engineer        text,
    week_start_date          date,
    week_end_date            date,
    first_reading_mv         numeric,
    latest_reading_mv        numeric,
    weekly_average_mv        numeric,
    minimum_reading_mv       numeric,
    maximum_reading_mv       numeric,
    change_from_start_mv     numeric,
    reading_count            bigint,
    protected_count          bigint,
    unprotected_count        bigint,
    protected_percentage     numeric,
    threshold_crossing_count bigint,
    first_reading_ts         timestamp with time zone,
    latest_reading_ts        timestamp with time zone,
    status_change            text,
    current_display_status   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with bounds as (
    select
      (p_week_start::timestamp at time zone p_timezone) as week_start_ts,
      ((p_week_start + 7)::timestamp at time zone p_timezone) as next_week_start_ts
  ),
  week_batches as materialized (
    select
      rb.id,
      rb.reading_ts
    from public.reading_batches rb
    cross join bounds b
    where rb.reading_ts >= b.week_start_ts
      and rb.reading_ts < b.next_week_start_ts
  ),
  points as (
    select
      tp.id,
      tp.label as test_point_code,
      tp.label as test_point_label,
      coalesce(tp.threshold_mv, -850)::numeric as threshold_mv,
      tp.location_id,
      l.site_name,
      l.latitude,
      l.longitude,
      u.full_name as assigned_engineer
    from public.test_points tp
    left join public.locations l on l.id = tp.location_id
    left join public.users u on u.id = tp.assigned_engineer_id
    where tp.is_active = true
  ),
  raw_readings as (
    select
      p.id as test_point_id,
      wb.reading_ts,
      tpr.value_mv::numeric as value_mv,
      coalesce(tpr.threshold_mv_snapshot, p.threshold_mv, -850)::numeric as threshold_mv
    from week_batches wb
    join public.test_point_readings tpr on tpr.batch_id = wb.id
    join points p on p.id = tpr.test_point_id
    where tpr.value_mv is not null
  ),
  ordered as (
    select
      raw_readings.*,
      (value_mv <= threshold_mv) as is_protected,
      lag(value_mv <= threshold_mv) over (
        partition by test_point_id
        order by reading_ts
      ) as previous_is_protected
    from raw_readings
  ),
  aggregated as (
    select
      test_point_id,
      (array_agg(value_mv order by reading_ts asc))[1] as first_reading_mv,
      (array_agg(value_mv order by reading_ts desc))[1] as latest_reading_mv,
      (array_agg(threshold_mv order by reading_ts desc))[1] as latest_threshold_mv,
      avg(value_mv) as weekly_average_mv,
      min(value_mv) as minimum_reading_mv,
      max(value_mv) as maximum_reading_mv,
      count(*) as reading_count,
      count(*) filter (where is_protected) as protected_count,
      count(*) filter (where not is_protected) as unprotected_count,
      (count(*) filter (where is_protected)::numeric / nullif(count(*), 0)::numeric) * 100 as protected_percentage,
      count(*) filter (where previous_is_protected is not null and previous_is_protected <> is_protected) as threshold_crossing_count,
      min(reading_ts) as first_reading_ts,
      max(reading_ts) as latest_reading_ts
    from ordered
    group by test_point_id
  )
  select
    p.id as test_point_id,
    p.test_point_code,
    p.test_point_label,
    p.threshold_mv,
    p.location_id,
    p.site_name,
    p.latitude,
    p.longitude,
    p.assigned_engineer,
    p_week_start as week_start_date,
    (p_week_start + 6) as week_end_date,
    a.first_reading_mv,
    a.latest_reading_mv,
    a.weekly_average_mv,
    a.minimum_reading_mv,
    a.maximum_reading_mv,
    case when coalesce(a.reading_count, 0) >= 2 then a.latest_reading_mv - a.first_reading_mv else null end as change_from_start_mv,
    coalesce(a.reading_count, 0) as reading_count,
    coalesce(a.protected_count, 0) as protected_count,
    coalesce(a.unprotected_count, 0) as unprotected_count,
    a.protected_percentage,
    coalesce(a.threshold_crossing_count, 0) as threshold_crossing_count,
    a.first_reading_ts,
    a.latest_reading_ts,
    case
      when coalesce(a.reading_count, 0) < 2 then 'insufficient_data'
      when (a.latest_reading_mv - a.first_reading_mv) < (-1 * abs(p_stable_tolerance_mv)) then 'improved'
      when (a.latest_reading_mv - a.first_reading_mv) > abs(p_stable_tolerance_mv) then 'declined'
      else 'stable'
    end as status_change,
    case
      when a.latest_reading_mv is null then 'Unknown'
      when a.latest_reading_mv <= coalesce(a.latest_threshold_mv, p.threshold_mv, -850) then 'Protected'
      when a.latest_reading_mv <= -800 then 'Warning'
      else 'Unprotected'
    end as current_display_status
  from points p
  left join aggregated a on a.test_point_id = p.id
  order by p.test_point_code;
$function$;

REVOKE ALL ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_test_point_weekly_summaries (
  p_week_start          date,
  p_timezone            text    DEFAULT 'Asia/Singapore'::text,
  p_stable_tolerance_mv integer DEFAULT 5,
  p_test_point_ids      uuid[]  DEFAULT NULL::uuid[]
)
  RETURNS TABLE (
    test_point_id            uuid,
    test_point_code          text,
    test_point_label         text,
    threshold_mv             numeric,
    location_id              uuid,
    site_name                text,
    latitude                 numeric,
    longitude                numeric,
    assigned_engineer        text,
    week_start_date          date,
    week_end_date            date,
    first_reading_mv         numeric,
    latest_reading_mv        numeric,
    weekly_average_mv        numeric,
    minimum_reading_mv       numeric,
    maximum_reading_mv       numeric,
    change_from_start_mv     numeric,
    reading_count            bigint,
    protected_count          bigint,
    unprotected_count        bigint,
    protected_percentage     numeric,
    threshold_crossing_count bigint,
    first_reading_ts         timestamp with time zone,
    latest_reading_ts        timestamp with time zone,
    status_change            text,
    current_display_status   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    tp.id as test_point_id,
    tp.label as test_point_code,
    tp.label as test_point_label,
    tp.threshold_mv::numeric,
    tp.location_id,
    l.site_name,
    l.latitude,
    l.longitude,
    u.full_name as assigned_engineer,
    p_week_start as week_start_date,
    p_week_start + 6 as week_end_date,
    ws.first_reading_mv,
    ws.latest_reading_mv,
    ws.weekly_average_mv,
    ws.minimum_reading_mv,
    ws.maximum_reading_mv,
    ws.change_from_start_mv,
    coalesce(ws.reading_count, 0)::bigint as reading_count,
    coalesce(ws.protected_count, 0)::bigint as protected_count,
    coalesce(ws.unprotected_count, 0)::bigint as unprotected_count,
    ws.protected_percentage,
    coalesce(ws.threshold_crossing_count, 0)::bigint as threshold_crossing_count,
    ws.first_reading_ts,
    ws.latest_reading_ts,
    coalesce(ws.status_change, 'insufficient_data') as status_change,
    case
      when ws.latest_reading_mv is null then 'Unknown'
      when ws.latest_reading_mv <= tp.threshold_mv then 'Protected'
      when ws.latest_reading_mv <= -800 then 'Warning'
      else 'Unprotected'
    end as current_display_status
  from public.test_points tp
  left join public.locations l on l.id = tp.location_id
  left join public.users u on u.id = tp.assigned_engineer_id
  left join public.weekly_summaries ws
    on ws.test_point_id = tp.id
   and ws.week_start_date = p_week_start
   and ws.week_end_date = p_week_start + 6
  where tp.is_active = true
    and (p_test_point_ids is null or tp.id = any(p_test_point_ids))
  order by tp.label;
$function$;

REVOKE ALL ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer, uuid[]) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_weekly_summary_available_weeks (
  p_timezone text    DEFAULT 'Asia/Singapore'::text,
  p_limit    integer DEFAULT 32
)
  RETURNS TABLE (
    week_start_date   date,
    week_end_date     date,
    reading_count     bigint,
    first_reading_ts  timestamp with time zone,
    latest_reading_ts timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    ws.week_start_date,
    ws.week_end_date,
    sum(ws.reading_count)::bigint as reading_count,
    min(ws.first_reading_ts) as first_reading_ts,
    max(ws.latest_reading_ts) as latest_reading_ts
  from public.weekly_summaries ws
  join public.test_points tp
    on tp.id = ws.test_point_id
   and tp.is_active = true
  where ws.reading_count > 0
  group by ws.week_start_date, ws.week_end_date
  order by ws.week_start_date desc
  limit greatest(1, least(coalesce(p_limit, 32), 104));
$function$;

REVOKE ALL ON FUNCTION "public"."get_weekly_summary_available_weeks"(text, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $function$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$function$;

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.process_summary_refresh_queue (
  p_limit               integer DEFAULT 100,
  p_stable_tolerance_mv integer DEFAULT 5
)
  RETURNS TABLE (
    processed_count integer,
    error_count     integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_item record;
  v_processed integer := 0;
  v_errors integer := 0;
  v_week_start date;
begin
  for v_item in
    select test_point_id, summary_date
    from public.summary_refresh_queue
    order by requested_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    begin
      v_week_start := public.summary_week_start(v_item.summary_date);

      perform public.refresh_daily_summary(v_item.test_point_id, v_item.summary_date);
      perform public.refresh_weekly_summary(v_item.test_point_id, v_week_start, p_stable_tolerance_mv);

      delete from public.summary_refresh_queue
      where test_point_id = v_item.test_point_id
        and summary_date = v_item.summary_date;

      v_processed := v_processed + 1;
    exception when others then
      v_errors := v_errors + 1;
      raise warning 'Summary refresh failed for test_point_id %, date %: %',
        v_item.test_point_id,
        v_item.summary_date,
        sqlerrm;
    end;
  end loop;

  processed_count := v_processed;
  error_count := v_errors;
  return next;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."process_summary_refresh_queue"(integer, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.queue_summary_refresh (
  p_test_point_id uuid,
  p_summary_date  date
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if p_test_point_id is null or p_summary_date is null then
    return;
  end if;

  insert into public.summary_refresh_queue (test_point_id, summary_date, requested_at)
  values (p_test_point_id, p_summary_date, now())
  on conflict (test_point_id, summary_date)
  do update set requested_at = least(public.summary_refresh_queue.requested_at, excluded.requested_at);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh"(uuid, date) FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.queue_summary_refresh_for_batch_timestamp_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_reading record;
begin
  if tg_op = 'UPDATE'
    and old.reading_ts is not distinct from new.reading_ts
    and old.temperature_c is not distinct from new.temperature_c
    and old.medium_conductivity is not distinct from new.medium_conductivity then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    for v_reading in
      select tpr.test_point_id
      from public.test_point_readings tpr
      where tpr.batch_id = old.id
    loop
      perform public.queue_summary_refresh(
        v_reading.test_point_id,
        (old.reading_ts at time zone 'Asia/Singapore')::date
      );
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    for v_reading in
      select tpr.test_point_id
      from public.test_point_readings tpr
      where tpr.batch_id = new.id
    loop
      perform public.queue_summary_refresh(
        v_reading.test_point_id,
        (new.reading_ts at time zone 'Asia/Singapore')::date
      );
    end loop;
  end if;

  return coalesce(new, old);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh_for_batch_timestamp_change"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.queue_summary_refresh_for_reading_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_old_reading_ts timestamptz;
  v_new_reading_ts timestamptz;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select rb.reading_ts
      into v_old_reading_ts
    from public.reading_batches rb
    where rb.id = old.batch_id;

    perform public.queue_summary_refresh(
      old.test_point_id,
      (v_old_reading_ts at time zone 'Asia/Singapore')::date
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select rb.reading_ts
      into v_new_reading_ts
    from public.reading_batches rb
    where rb.id = new.batch_id;

    perform public.queue_summary_refresh(
      new.test_point_id,
      (v_new_reading_ts at time zone 'Asia/Singapore')::date
    );
  end if;

  return coalesce(new, old);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh_for_reading_change"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.refresh_daily_summary (
  p_test_point_id uuid,
  p_summary_date  date,
  p_timezone      text DEFAULT 'Asia/Singapore'::text
)
  RETURNS SETOF public.daily_summaries
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_start_ts timestamptz := (p_summary_date::timestamp at time zone p_timezone);
  v_end_ts timestamptz := ((p_summary_date + 1)::timestamp at time zone p_timezone);
  v_count integer;
  v_row public.daily_summaries%rowtype;
begin
  if p_test_point_id is null or p_summary_date is null then
    raise exception 'test_point_id and summary_date are required.';
  end if;

  select count(*)
    into v_count
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  join public.test_points tp on tp.id = tpr.test_point_id
  where tpr.test_point_id = p_test_point_id
    and tpr.value_mv is not null
    and rb.reading_ts >= v_start_ts
    and rb.reading_ts < v_end_ts;

  -- Chosen no-data behavior: delete the daily summary row if all raw readings
  -- for that Test Point/date have been removed or moved.
  if v_count = 0 then
    delete from public.daily_summaries
    where test_point_id = p_test_point_id
      and summary_date = p_summary_date;
    return;
  end if;

  with raw_readings as (
    select
      tpr.test_point_id,
      rb.reading_ts,
      tpr.value_mv::integer as value_mv,
      coalesce(tpr.threshold_mv_snapshot, tp.threshold_mv, -850)::integer as threshold_mv,
      rb.temperature_c,
      rb.medium_conductivity
    from public.test_point_readings tpr
    join public.reading_batches rb on rb.id = tpr.batch_id
    join public.test_points tp on tp.id = tpr.test_point_id
    where tpr.test_point_id = p_test_point_id
      and tpr.value_mv is not null
      and rb.reading_ts >= v_start_ts
      and rb.reading_ts < v_end_ts
  ),
  ordered as (
    select
      raw_readings.*,
      (value_mv <= threshold_mv) as is_protected,
      lag(value_mv <= threshold_mv) over (order by reading_ts) as previous_is_protected
    from raw_readings
  ),
  aggregated as (
    select
      test_point_id,
      (array_agg(value_mv order by reading_ts asc))[1] as first_reading_mv,
      (array_agg(value_mv order by reading_ts desc))[1] as latest_reading_mv,
      avg(value_mv) as daily_average_mv,
      min(value_mv) as minimum_reading_mv,
      max(value_mv) as maximum_reading_mv,
      count(*)::integer as reading_count,
      count(*) filter (where is_protected)::integer as protected_count,
      count(*) filter (where not is_protected)::integer as unprotected_count,
      (count(*) filter (where is_protected)::numeric / nullif(count(*), 0)::numeric) * 100 as protected_percentage,
      count(*) filter (
        where previous_is_protected is not null
          and previous_is_protected <> is_protected
      )::integer as threshold_crossing_count,
      min(reading_ts) as first_reading_ts,
      max(reading_ts) as latest_reading_ts,
      avg(temperature_c) as average_temperature_c,
      avg(medium_conductivity) as average_conductivity,
      (array_agg(is_protected order by reading_ts asc))[1] as first_is_protected,
      (array_agg(is_protected order by reading_ts desc))[1] as latest_is_protected
    from ordered
    group by test_point_id
  )
  insert into public.daily_summaries (
    test_point_id,
    summary_date,
    first_reading_mv,
    latest_reading_mv,
    daily_average_mv,
    minimum_reading_mv,
    maximum_reading_mv,
    reading_count,
    protected_count,
    unprotected_count,
    protected_percentage,
    threshold_crossing_count,
    first_reading_ts,
    latest_reading_ts,
    average_temperature_c,
    average_conductivity,
    first_is_protected,
    latest_is_protected,
    generated_at,
    updated_at
  )
  select
    test_point_id,
    p_summary_date,
    first_reading_mv,
    latest_reading_mv,
    daily_average_mv,
    minimum_reading_mv,
    maximum_reading_mv,
    reading_count,
    protected_count,
    unprotected_count,
    protected_percentage,
    threshold_crossing_count,
    first_reading_ts,
    latest_reading_ts,
    average_temperature_c,
    average_conductivity,
    first_is_protected,
    latest_is_protected,
    now(),
    now()
  from aggregated
  on conflict (test_point_id, summary_date)
  do update set
    first_reading_mv = excluded.first_reading_mv,
    latest_reading_mv = excluded.latest_reading_mv,
    daily_average_mv = excluded.daily_average_mv,
    minimum_reading_mv = excluded.minimum_reading_mv,
    maximum_reading_mv = excluded.maximum_reading_mv,
    reading_count = excluded.reading_count,
    protected_count = excluded.protected_count,
    unprotected_count = excluded.unprotected_count,
    protected_percentage = excluded.protected_percentage,
    threshold_crossing_count = excluded.threshold_crossing_count,
    first_reading_ts = excluded.first_reading_ts,
    latest_reading_ts = excluded.latest_reading_ts,
    average_temperature_c = excluded.average_temperature_c,
    average_conductivity = excluded.average_conductivity,
    first_is_protected = excluded.first_is_protected,
    latest_is_protected = excluded.latest_is_protected,
    updated_at = now()
  returning * into v_row;

  return next v_row;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."refresh_daily_summary"(uuid, date, text) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.refresh_weekly_summary (
  p_test_point_id       uuid,
  p_week_start_date     date,
  p_stable_tolerance_mv integer DEFAULT 5
)
  RETURNS SETOF public.weekly_summaries
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_week_end_date date := p_week_start_date + 6;
  v_reading_count integer;
  v_row public.weekly_summaries%rowtype;
begin
  if p_test_point_id is null or p_week_start_date is null then
    raise exception 'test_point_id and week_start_date are required.';
  end if;

  select coalesce(sum(reading_count), 0)::integer
    into v_reading_count
  from public.daily_summaries
  where test_point_id = p_test_point_id
    and summary_date >= p_week_start_date
    and summary_date <= v_week_end_date;

  if v_reading_count = 0 then
    delete from public.weekly_summaries
    where test_point_id = p_test_point_id
      and week_start_date = p_week_start_date
      and week_end_date = v_week_end_date;
    return;
  end if;

  with week_days as (
    select *
    from public.daily_summaries
    where test_point_id = p_test_point_id
      and summary_date >= p_week_start_date
      and summary_date <= v_week_end_date
      and reading_count > 0
  ),
  ordered_days as (
    select
      week_days.*,
      lag(latest_is_protected) over (order by summary_date) as previous_latest_is_protected
    from week_days
  ),
  aggregated as (
    select
      test_point_id,
      (array_agg(first_reading_mv order by first_reading_ts asc))[1] as first_reading_mv,
      (array_agg(latest_reading_mv order by latest_reading_ts desc))[1] as latest_reading_mv,
      (sum(daily_average_mv * reading_count) / nullif(sum(reading_count), 0)) as weekly_average_mv,
      min(minimum_reading_mv) as minimum_reading_mv,
      max(maximum_reading_mv) as maximum_reading_mv,
      sum(reading_count)::integer as reading_count,
      sum(protected_count)::integer as protected_count,
      sum(unprotected_count)::integer as unprotected_count,
      (sum(protected_count)::numeric / nullif(sum(reading_count), 0)::numeric) * 100 as protected_percentage,
      (
        sum(threshold_crossing_count)
        + count(*) filter (
          where previous_latest_is_protected is not null
            and previous_latest_is_protected <> first_is_protected
        )
      )::integer as threshold_crossing_count,
      min(first_reading_ts) as first_reading_ts,
      max(latest_reading_ts) as latest_reading_ts
    from ordered_days
    group by test_point_id
  )
  insert into public.weekly_summaries (
    test_point_id,
    week_start_date,
    week_end_date,
    first_reading_mv,
    latest_reading_mv,
    weekly_average_mv,
    change_from_start_mv,
    status_change,
    reading_count,
    protected_count,
    unprotected_count,
    protected_percentage,
    threshold_crossing_count,
    minimum_reading_mv,
    maximum_reading_mv,
    first_reading_ts,
    latest_reading_ts,
    generated_at,
    updated_at
  )
  select
    test_point_id,
    p_week_start_date,
    v_week_end_date,
    first_reading_mv,
    latest_reading_mv,
    weekly_average_mv,
    case when reading_count >= 2 then latest_reading_mv - first_reading_mv else null end,
    case
      when reading_count < 2 then 'insufficient_data'
      when (latest_reading_mv - first_reading_mv) < (-1 * abs(p_stable_tolerance_mv)) then 'improved'
      when (latest_reading_mv - first_reading_mv) > abs(p_stable_tolerance_mv) then 'declined'
      else 'stable'
    end,
    reading_count,
    protected_count,
    unprotected_count,
    protected_percentage,
    threshold_crossing_count,
    minimum_reading_mv,
    maximum_reading_mv,
    first_reading_ts,
    latest_reading_ts,
    now(),
    now()
  from aggregated
  on conflict (test_point_id, week_start_date, week_end_date)
  do update set
    first_reading_mv = excluded.first_reading_mv,
    latest_reading_mv = excluded.latest_reading_mv,
    weekly_average_mv = excluded.weekly_average_mv,
    change_from_start_mv = excluded.change_from_start_mv,
    status_change = excluded.status_change,
    reading_count = excluded.reading_count,
    protected_count = excluded.protected_count,
    unprotected_count = excluded.unprotected_count,
    protected_percentage = excluded.protected_percentage,
    threshold_crossing_count = excluded.threshold_crossing_count,
    minimum_reading_mv = excluded.minimum_reading_mv,
    maximum_reading_mv = excluded.maximum_reading_mv,
    first_reading_ts = excluded.first_reading_ts,
    latest_reading_ts = excluded.latest_reading_ts,
    generated_at = now(),
    updated_at = now()
  returning * into v_row;

  return next v_row;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."refresh_weekly_summary"(uuid, date, integer) FROM "anon", "service_role";

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.set_test_point_position (
  p_test_point_id         uuid,
  p_coordinate_mode       text,
  p_latitude              numeric DEFAULT NULL::numeric,
  p_longitude             numeric DEFAULT NULL::numeric,
  p_relative_x_m          numeric DEFAULT NULL::numeric,
  p_relative_y_m          numeric DEFAULT NULL::numeric,
  p_relative_z_m          numeric DEFAULT NULL::numeric,
  p_chainage_m            numeric DEFAULT NULL::numeric,
  p_coordinate_accuracy_m numeric DEFAULT NULL::numeric,
  p_coordinate_source     text    DEFAULT NULL::text
)
  RETURNS public.test_point_positions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_mode text := lower(trim(coalesce(p_coordinate_mode, '')));
  v_position public.test_point_positions;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
      and lower(u.role::text) = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Only an active Admin may manage Test Point positions.';
  end if;

  -- The row lock serialises concurrent moves for the same Test Point.
  perform 1
  from public.test_points tp
  where tp.id = p_test_point_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Test Point not found.';
  end if;

  if v_mode not in ('gps', 'relative', 'gps_and_relative', 'unmapped') then
    raise exception using errcode = '22023', message = 'Invalid coordinate mode.';
  end if;

  if v_mode in ('gps', 'gps_and_relative')
     and (p_latitude is null or p_longitude is null) then
    raise exception using errcode = '22023', message = 'Latitude and longitude are required for this coordinate mode.';
  end if;

  if v_mode in ('relative', 'gps_and_relative')
     and (p_relative_x_m is null or p_relative_y_m is null) then
    raise exception using errcode = '22023', message = 'Relative X and Relative Y are required for this coordinate mode.';
  end if;

  if p_latitude is not null and p_latitude not between -90 and 90 then
    raise exception using errcode = '22023', message = 'Latitude must be between -90 and 90.';
  end if;

  if p_longitude is not null and p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Longitude must be between -180 and 180.';
  end if;

  if p_coordinate_accuracy_m is not null and p_coordinate_accuracy_m < 0 then
    raise exception using errcode = '22023', message = 'Coordinate accuracy cannot be negative.';
  end if;

  update public.test_point_positions
  set is_current = false,
      valid_to = v_now,
      updated_at = v_now,
      updated_by = v_user_id
  where test_point_id = p_test_point_id
    and is_current = true;

  insert into public.test_point_positions (
    test_point_id,
    coordinate_mode,
    latitude,
    longitude,
    relative_x_m,
    relative_y_m,
    relative_z_m,
    chainage_m,
    coordinate_accuracy_m,
    coordinate_source,
    is_current,
    valid_from,
    valid_to,
    updated_by
  ) values (
    p_test_point_id,
    v_mode,
    case when v_mode in ('gps', 'gps_and_relative') then p_latitude else null end,
    case when v_mode in ('gps', 'gps_and_relative') then p_longitude else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_x_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_y_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_relative_z_m else null end,
    case when v_mode in ('relative', 'gps_and_relative') then p_chainage_m else null end,
    case when v_mode = 'unmapped' then null else p_coordinate_accuracy_m end,
    nullif(trim(coalesce(p_coordinate_source, '')), ''),
    true,
    v_now,
    null,
    v_user_id
  )
  returning * into v_position;

  return v_position;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_test_point_position"(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.set_test_point_positions_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_test_point_positions_updated_at"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.summary_is_engineer_or_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'corrosion_engineer')
  )
$function$;

REVOKE ALL ON FUNCTION "public"."summary_is_engineer_or_admin"() FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.summary_week_start (
  p_date date
)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select date_trunc('week', p_date::timestamp)::date
$function$;

REVOKE ALL ON FUNCTION "public"."summary_week_start"(date) FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.update_manual_reading (
  p_reading_id            uuid,
  p_test_point_id         uuid                     DEFAULT NULL::uuid,
  p_reading_ts            timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_value_mv              integer                  DEFAULT NULL::integer,
  p_threshold_mv_snapshot integer                  DEFAULT NULL::integer,
  p_temperature_c         numeric                  DEFAULT NULL::numeric,
  p_medium_conductivity   numeric                  DEFAULT NULL::numeric,
  p_ph                    numeric                  DEFAULT NULL::numeric,
  p_dissolved_oxygen      numeric                  DEFAULT NULL::numeric,
  p_power_watts           numeric                  DEFAULT NULL::numeric,
  p_stable_tolerance_mv   integer                  DEFAULT 5
)
  RETURNS TABLE (
    reading_id       uuid,
    batch_id         uuid,
    test_point_id    uuid,
    value_mv         integer,
    reading_ts       timestamp with time zone,
    old_summary_date date,
    new_summary_date date
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old record;
  v_new record;
  v_old_date date;
  v_new_date date;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select
    tpr.id as reading_id,
    tpr.batch_id,
    tpr.test_point_id,
    tpr.value_mv,
    tpr.threshold_mv_snapshot,
    rb.reading_ts,
    rb.upload_method
  into v_old
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.id = p_reading_id
  for update;

  if v_old.reading_id is null then
    raise exception 'Reading was not found.';
  end if;

  if v_old.upload_method <> 'manual' then
    raise exception 'Only manual readings can be edited with update_manual_reading.';
  end if;

  v_old_date := (v_old.reading_ts at time zone 'Asia/Singapore')::date;

  update public.test_point_readings
  set
    test_point_id = coalesce(p_test_point_id, test_point_id),
    value_mv = coalesce(p_value_mv, value_mv),
    threshold_mv_snapshot = coalesce(p_threshold_mv_snapshot, threshold_mv_snapshot)
  where id = p_reading_id;

  update public.reading_batches
  set
    reading_ts = coalesce(p_reading_ts, reading_ts),
    temperature_c = coalesce(p_temperature_c, temperature_c),
    medium_conductivity = coalesce(p_medium_conductivity, medium_conductivity),
    ph = coalesce(p_ph, ph),
    dissolved_oxygen = coalesce(p_dissolved_oxygen, dissolved_oxygen),
    power_watts = coalesce(p_power_watts, power_watts)
  where id = v_old.batch_id;

  select
    tpr.id as reading_id,
    tpr.batch_id,
    tpr.test_point_id,
    tpr.value_mv,
    rb.reading_ts
  into v_new
  from public.test_point_readings tpr
  join public.reading_batches rb on rb.id = tpr.batch_id
  where tpr.id = p_reading_id;

  v_new_date := (v_new.reading_ts at time zone 'Asia/Singapore')::date;

  perform public.refresh_daily_summary(v_old.test_point_id, v_old_date);
  perform public.refresh_weekly_summary(v_old.test_point_id, public.summary_week_start(v_old_date), p_stable_tolerance_mv);

  if v_new.test_point_id is distinct from v_old.test_point_id
    or v_new_date is distinct from v_old_date then
    perform public.refresh_daily_summary(v_new.test_point_id, v_new_date);
    perform public.refresh_weekly_summary(v_new.test_point_id, public.summary_week_start(v_new_date), p_stable_tolerance_mv);
  end if;

  reading_id := v_new.reading_id;
  batch_id := v_new.batch_id;
  test_point_id := v_new.test_point_id;
  value_mv := v_new.value_mv;
  reading_ts := v_new.reading_ts;
  old_summary_date := v_old_date;
  new_summary_date := v_new_date;
  return next;
end;
$function$;

REVOKE ALL
  ON FUNCTION "public"."update_manual_reading"(uuid, uuid, timestamp WITH time zone, integer, integer, numeric, numeric, numeric, numeric, numeric, integer)
  FROM PUBLIC, "anon", "authenticated", "service_role";

ALTER TABLE "public"."locations"
  ADD CONSTRAINT "locations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."reading_batches"
  ADD CONSTRAINT "reading_batches_entered_by_fkey" FOREIGN KEY (entered_by) REFERENCES auth.users(id);

ALTER TABLE "public"."reading_batches"
  ADD CONSTRAINT "reading_batches_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_point_positions"
  ADD CONSTRAINT "test_point_positions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE "public"."test_point_readings"
  ADD CONSTRAINT "test_point_readings_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.reading_batches(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_points"
  ADD CONSTRAINT "test_points_current_equipment_version_id_fkey" FOREIGN KEY (current_equipment_version_id) REFERENCES public.test_point_equipment_versions(id);

ALTER TABLE "public"."test_points"
  ADD CONSTRAINT "test_points_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;

ALTER TABLE "public"."daily_summaries"
  ADD CONSTRAINT "daily_summaries_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

ALTER TABLE "public"."summary_refresh_queue"
  ADD CONSTRAINT "summary_refresh_queue_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_point_equipment_versions"
  ADD CONSTRAINT "test_point_equipment_versions_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_point_positions"
  ADD CONSTRAINT "test_point_positions_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_point_readings"
  ADD CONSTRAINT "test_point_readings_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

ALTER TABLE "public"."users"
  ADD CONSTRAINT "app_users_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."users"
  ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."dashboard_layouts"
  ADD CONSTRAINT "dashboard_layouts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."test_point_equipment_versions"
  ADD CONSTRAINT "test_point_equipment_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE "public"."test_points"
  ADD CONSTRAINT "test_points_assigned_engineer_id_fkey" FOREIGN KEY (assigned_engineer_id) REFERENCES public.users(id);

ALTER TABLE "public"."weekly_summaries"
  ADD CONSTRAINT "weekly_summaries_test_point_id_fkey" FOREIGN KEY (test_point_id) REFERENCES public.test_points(id) ON DELETE CASCADE;

CREATE VIEW "public"."v_readings" WITH (security_invoker=true) AS  SELECT tpr.id,
    tpr.batch_id,
    tpr.test_point_id,
    tp.label AS test_point_label,
    rb.location_id,
    l.site_name,
    tpr.value_mv,
    tpr.threshold_mv_snapshot,
    tpr.is_protected,
    rb.reading_ts,
    rb.upload_method,
    rb.temperature_c,
    rb.medium_conductivity,
    rb.ph,
    rb.dissolved_oxygen,
    rb.power_watts,
    rb.source_file,
    rb.entered_by,
    tpr.created_at
   FROM (((public.test_point_readings tpr
     JOIN public.reading_batches rb ON ((rb.id = tpr.batch_id)))
     JOIN public.test_points tp ON ((tp.id = tpr.test_point_id)))
     LEFT JOIN public.locations l ON ((l.id = rb.location_id)));

CREATE INDEX idx_daily_summaries_date ON public.daily_summaries USING btree (summary_date);

CREATE INDEX idx_equipment_versions_active ON public.test_point_equipment_versions USING btree (test_point_id)
  WHERE (removed_at IS NULL);

CREATE INDEX idx_equipment_versions_test_point ON public.test_point_equipment_versions USING btree (test_point_id, installed_at DESC);

CREATE INDEX idx_locations_site_name ON public.locations USING btree (site_name);

CREATE INDEX idx_reading_batches_location_reading_ts ON public.reading_batches USING btree (location_id, reading_ts);

CREATE INDEX idx_reading_batches_location_ts ON public.reading_batches USING btree (location_id, reading_ts DESC);

CREATE INDEX idx_reading_batches_reading_ts ON public.reading_batches USING btree (reading_ts);

CREATE INDEX idx_reading_batches_ts ON public.reading_batches USING btree (reading_ts DESC);

CREATE INDEX idx_summary_refresh_queue_requested_at ON public.summary_refresh_queue USING btree (requested_at);

CREATE INDEX idx_test_point_readings_batch_test_point ON public.test_point_readings USING btree (batch_id, test_point_id);

CREATE INDEX idx_test_point_readings_created_at ON public.test_point_readings USING btree (created_at DESC);

CREATE INDEX idx_test_point_readings_test_point_batch ON public.test_point_readings USING btree (test_point_id, batch_id);

CREATE INDEX idx_test_point_readings_test_point ON public.test_point_readings USING btree (test_point_id);

CREATE INDEX idx_test_points_location_id ON public.test_points USING btree (location_id);

CREATE INDEX idx_weekly_summaries_test_point_week ON public.weekly_summaries USING btree (test_point_id, week_start_date DESC);

CREATE INDEX idx_weekly_summaries_week_start ON public.weekly_summaries USING btree (week_start_date);

CREATE INDEX test_point_positions_coordinate_mode_idx ON public.test_point_positions USING btree (coordinate_mode)
  WHERE (is_current = true);

CREATE INDEX test_point_positions_history_lookup_idx ON public.test_point_positions USING btree (test_point_id, valid_from DESC);

CREATE UNIQUE INDEX test_point_positions_one_current_position ON public.test_point_positions USING btree (test_point_id)
  WHERE (is_current = true);

CREATE INDEX test_point_positions_test_point_id_idx ON public.test_point_positions USING btree (test_point_id);

CREATE TRIGGER trg_queue_summary_refresh_for_batch_timestamp_change
  AFTER DELETE OR UPDATE OF reading_ts, temperature_c, medium_conductivity ON public.reading_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_summary_refresh_for_batch_timestamp_change();

CREATE TRIGGER trg_test_point_positions_updated_at
  BEFORE UPDATE ON public.test_point_positions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_test_point_positions_updated_at();

CREATE TRIGGER trg_queue_summary_refresh_for_reading_change
  AFTER INSERT OR DELETE OR UPDATE ON public.test_point_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_summary_refresh_for_reading_change();

CREATE POLICY "Engineers and admins can read daily summaries" ON "public"."daily_summaries"
  FOR SELECT
  TO "authenticated"
  USING (public.summary_is_engineer_or_admin());

CREATE POLICY "Users can create their own dashboard layout" ON "public"."dashboard_layouts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can delete their own dashboard layout" ON "public"."dashboard_layouts"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can read their own dashboard layout" ON "public"."dashboard_layouts"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can update their own dashboard layout" ON "public"."dashboard_layouts"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Active users can read locations" ON "public"."locations"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.current_user_is_active() AS current_user_is_active));

CREATE POLICY "Admins can manage locations" ON "public"."locations"
  FOR ALL
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Active users can insert their own reading batches" ON "public"."reading_batches"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.current_user_is_active() AND (entered_by = auth.uid())));

CREATE POLICY "Active users can read reading batches" ON "public"."reading_batches"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.current_user_is_active() AS current_user_is_active));

CREATE POLICY "Admins can delete reading batches" ON "public"."reading_batches"
  FOR DELETE
  TO "authenticated"
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can update and delete reading batches" ON "public"."reading_batches"
  FOR UPDATE
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users can edit their own recent reading batches" ON "public"."reading_batches"
  FOR UPDATE
  TO "authenticated"
  USING ((public.current_user_is_active() AND (entered_by = auth.uid()) AND (created_at > (now() - '01:00:00'::interval))))
  WITH CHECK ((public.current_user_is_active() AND (entered_by = auth.uid()) AND (created_at > (now() - '01:00:00'::interval))));

CREATE POLICY "Admins can inspect summary refresh queue" ON "public"."summary_refresh_queue"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.is_active = true) AND (u.role = 'admin'::text)))));

CREATE POLICY "Active users can read test point equipment versions" ON "public"."test_point_equipment_versions"
  FOR SELECT
  TO "authenticated"
  USING (public.current_user_is_active());

CREATE POLICY "Admins can delete test point equipment versions" ON "public"."test_point_equipment_versions"
  FOR DELETE
  TO "authenticated"
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can insert test point equipment versions" ON "public"."test_point_equipment_versions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can update test point equipment versions" ON "public"."test_point_equipment_versions"
  FOR UPDATE
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Engineers and admins can read current test point positions" ON "public"."test_point_positions"
  FOR SELECT
  TO "authenticated"
  USING (((is_current = true) AND (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active = true) AND (lower(u.role) = ANY (ARRAY['admin'::text, 'corrosion_engineer'::text])))))));

CREATE POLICY "Active users can insert readings into their own batches" ON "public"."test_point_readings"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.current_user_is_active() AND (EXISTS ( SELECT 1
   FROM public.reading_batches rb
  WHERE ((rb.id = test_point_readings.batch_id) AND (rb.entered_by = auth.uid()))))));

CREATE POLICY "Active users can read test point readings" ON "public"."test_point_readings"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.current_user_is_active() AS current_user_is_active));

CREATE POLICY "Admins can delete test point readings" ON "public"."test_point_readings"
  FOR DELETE
  TO "authenticated"
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can update and delete test point readings" ON "public"."test_point_readings"
  FOR UPDATE
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users can edit their own recent test point readings" ON "public"."test_point_readings"
  FOR UPDATE
  TO "authenticated"
  USING ((public.current_user_is_active() AND (EXISTS ( SELECT 1
   FROM public.reading_batches rb
  WHERE ((rb.id = test_point_readings.batch_id) AND (rb.entered_by = auth.uid()) AND (rb.created_at > (now() - '01:00:00'::interval)))))))
  WITH CHECK ((public.current_user_is_active() AND (EXISTS ( SELECT 1
   FROM public.reading_batches rb
  WHERE ((rb.id = test_point_readings.batch_id) AND (rb.entered_by = auth.uid()) AND (rb.created_at > (now() - '01:00:00'::interval)))))));

CREATE POLICY "Active users can read test points" ON "public"."test_points"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.current_user_is_active() AS current_user_is_active));

CREATE POLICY "Admins can manage test points" ON "public"."test_points"
  FOR ALL
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins manage all users" ON "public"."users"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins read all users" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "Users read own profile" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((id = auth.uid()));

CREATE POLICY "Active users can create weekly summaries" ON "public"."weekly_summaries"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.current_user_is_active());

CREATE POLICY "Active users can read weekly summaries" ON "public"."weekly_summaries"
  FOR SELECT
  TO "authenticated"
  USING (public.current_user_is_active());

CREATE POLICY "Admins can delete weekly summaries" ON "public"."weekly_summaries"
  FOR DELETE
  TO "authenticated"
  USING (public.current_user_is_admin());

CREATE POLICY "Admins can update and delete weekly summaries" ON "public"."weekly_summaries"
  FOR UPDATE
  TO "authenticated"
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Engineers and admins can read weekly summaries" ON "public"."weekly_summaries"
  FOR SELECT
  TO "authenticated"
  USING (public.summary_is_engineer_or_admin());

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

COMMENT ON FUNCTION "public"."get_asset_map_points"() IS 'Compact current-position and latest-reading dataset for Asset Map; location coordinates are site context only.';

GRANT EXECUTE ON FUNCTION "public"."backfill_daily_and_weekly_summaries"(date, date, text, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."backfill_daily_and_weekly_summaries"(date, date, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."backfill_daily_and_weekly_summaries"(date, date, text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_recent_reading_exists"(uuid, timestamp WITH time zone, integer) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."check_recent_reading_exists"(uuid, timestamp WITH time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."check_recent_reading_exists"(uuid, timestamp WITH time zone, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."compare_weekly_summaries"(date, date, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."compare_weekly_summaries"(date, date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."compare_weekly_summaries"(date, date, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_manual_reading"(uuid, timestamp WITH time zone, integer, numeric, numeric, numeric, numeric, numeric) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."create_manual_reading"(uuid, timestamp WITH time zone, integer, numeric, numeric, numeric, numeric, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_manual_reading"(uuid, timestamp WITH time zone, integer, numeric, numeric, numeric, numeric, numeric) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_active"() TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."current_user_is_active"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_active"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_active"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_admin"() TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."current_user_is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_admin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_asset_map_points"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_asset_map_points"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_asset_map_points"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_daily_summaries"(date, text) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."get_test_point_daily_summaries"(date, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_daily_summaries"(date, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_daily_summaries"(date, text, uuid[]) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."get_test_point_daily_summaries"(date, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_daily_summaries"(date, text, uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_position_history"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_test_point_position_history"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_position_history"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer, uuid[]) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_test_point_weekly_summaries"(date, text, integer, uuid[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_weekly_summary_available_weeks"(text, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."get_weekly_summary_available_weeks"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_weekly_summary_available_weeks"(text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_summary_refresh_queue"(integer, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."process_summary_refresh_queue"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_summary_refresh_queue"(integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh"(uuid, date) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh"(uuid, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh_for_batch_timestamp_change"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh_for_batch_timestamp_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh_for_batch_timestamp_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh_for_reading_change"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."queue_summary_refresh_for_reading_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_summary_refresh_for_reading_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_daily_summary"(uuid, date, text) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."refresh_daily_summary"(uuid, date, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_daily_summary"(uuid, date, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_weekly_summary"(uuid, date, integer) TO PUBLIC, "authenticated";

REVOKE ALL ON FUNCTION "public"."refresh_weekly_summary"(uuid, date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_weekly_summary"(uuid, date, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_test_point_position"(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_test_point_position"(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_test_point_position"(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_test_point_positions_updated_at"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."set_test_point_positions_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_test_point_positions_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."summary_is_engineer_or_admin"() TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."summary_is_engineer_or_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."summary_is_engineer_or_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."summary_week_start"(date) TO PUBLIC;

REVOKE ALL ON FUNCTION "public"."summary_week_start"(date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."summary_week_start"(date) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."update_manual_reading"(uuid, uuid, timestamp WITH time zone, integer, integer, numeric, numeric, numeric, numeric, numeric, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."update_manual_reading"(uuid, uuid, timestamp WITH time zone, integer, integer, numeric, numeric, numeric, numeric, numeric, integer)
  TO "postgres";

REVOKE ALL ON TABLE "public"."backup_jalanban_reading_batches" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_reading_batches" TO "anon";

REVOKE ALL ON TABLE "public"."backup_jalanban_reading_batches" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_reading_batches" TO "authenticated";

REVOKE ALL ON TABLE "public"."backup_jalanban_reading_batches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."backup_jalanban_reading_batches" TO "postgres";

REVOKE ALL ON TABLE "public"."backup_jalanban_reading_batches" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_reading_batches" TO "service_role";

REVOKE ALL ON TABLE "public"."backup_jalanban_test_point_readings" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_test_point_readings" TO "anon";

REVOKE ALL ON TABLE "public"."backup_jalanban_test_point_readings" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_test_point_readings" TO "authenticated";

REVOKE ALL ON TABLE "public"."backup_jalanban_test_point_readings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."backup_jalanban_test_point_readings" TO "postgres";

REVOKE ALL ON TABLE "public"."backup_jalanban_test_point_readings" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."backup_jalanban_test_point_readings" TO "service_role";

REVOKE ALL ON TABLE "public"."daily_summaries" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."daily_summaries" TO "anon";

REVOKE ALL ON TABLE "public"."daily_summaries" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."daily_summaries" TO "authenticated";

REVOKE ALL ON TABLE "public"."daily_summaries" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_summaries" TO "postgres";

REVOKE ALL ON TABLE "public"."daily_summaries" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."daily_summaries" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dashboard_layouts" TO "authenticated";

REVOKE ALL ON TABLE "public"."dashboard_layouts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dashboard_layouts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dashboard_layouts" TO "service_role";

REVOKE ALL ON TABLE "public"."locations" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."locations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."locations" TO "authenticated";

REVOKE ALL ON TABLE "public"."locations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."locations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."locations" TO "service_role";

REVOKE ALL ON TABLE "public"."reading_batches" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."reading_batches" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reading_batches" TO "authenticated";

REVOKE ALL ON TABLE "public"."reading_batches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reading_batches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reading_batches" TO "service_role";

REVOKE ALL ON TABLE "public"."summary_refresh_queue" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."summary_refresh_queue" TO "anon";

REVOKE ALL ON TABLE "public"."summary_refresh_queue" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."summary_refresh_queue" TO "authenticated";

REVOKE ALL ON TABLE "public"."summary_refresh_queue" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."summary_refresh_queue" TO "postgres";

REVOKE ALL ON TABLE "public"."summary_refresh_queue" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."summary_refresh_queue" TO "service_role";

REVOKE ALL ON TABLE "public"."test_point_equipment_versions" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_point_equipment_versions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_equipment_versions" TO "authenticated";

REVOKE ALL ON TABLE "public"."test_point_equipment_versions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_equipment_versions" TO "postgres";

REVOKE ALL ON TABLE "public"."test_point_equipment_versions" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_point_equipment_versions" TO "service_role";

REVOKE ALL ON TABLE "public"."test_point_positions" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_point_positions" TO "anon";

REVOKE ALL ON TABLE "public"."test_point_positions" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."test_point_positions" TO "authenticated";

REVOKE ALL ON TABLE "public"."test_point_positions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_positions" TO "postgres";

REVOKE ALL ON TABLE "public"."test_point_positions" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_point_positions" TO "service_role";

REVOKE ALL ON TABLE "public"."test_point_readings" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_point_readings" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_readings" TO "authenticated";

REVOKE ALL ON TABLE "public"."test_point_readings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_readings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_point_readings" TO "service_role";

REVOKE ALL ON TABLE "public"."test_points" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."test_points" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_points" TO "authenticated";

REVOKE ALL ON TABLE "public"."test_points" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_points" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_points" TO "service_role";

REVOKE ALL ON TABLE "public"."users" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."users" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "authenticated";

REVOKE ALL ON TABLE "public"."users" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";

REVOKE ALL ON TABLE "public"."v_readings_backup_table" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."v_readings_backup_table" TO "anon";

REVOKE ALL ON TABLE "public"."v_readings_backup_table" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."v_readings_backup_table" TO "authenticated";

REVOKE ALL ON TABLE "public"."v_readings_backup_table" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_readings_backup_table" TO "postgres";

REVOKE ALL ON TABLE "public"."v_readings_backup_table" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."v_readings_backup_table" TO "service_role";

REVOKE ALL ON TABLE "public"."weekly_summaries" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."weekly_summaries" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."weekly_summaries" TO "authenticated";

REVOKE ALL ON TABLE "public"."weekly_summaries" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."weekly_summaries" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."weekly_summaries" TO "service_role";

REVOKE ALL ON TABLE "public"."v_readings" FROM "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."v_readings" TO "anon";

REVOKE ALL ON TABLE "public"."v_readings" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."v_readings" TO "authenticated";

REVOKE ALL ON TABLE "public"."v_readings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v_readings" TO "postgres";

REVOKE ALL ON TABLE "public"."v_readings" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."v_readings" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

SELECT cron.schedule_in_database('daily-summary-finalisation-0010-sgt', '10 16 * * *', 'select public.process_summary_refresh_queue(1000);', 'postgres', NULL, true);

SELECT cron.schedule_in_database('process-summary-refresh-queue-every-10-minutes', '*/10 * * * *', 'select public.process_summary_refresh_queue(500);', 'postgres', NULL, true);

