-- The application, policies, and bootstrap procedure all recognize the
-- platform-level super_admin role. The original enum omitted this value.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
