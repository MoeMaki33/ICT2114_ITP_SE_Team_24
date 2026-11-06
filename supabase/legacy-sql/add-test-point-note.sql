alter table public.test_points
add column if not exists note text;

comment on column public.locations.description is
'Shared note for the whole site/location.';

comment on column public.test_points.note is
'Point-specific note for an individual test point.';
