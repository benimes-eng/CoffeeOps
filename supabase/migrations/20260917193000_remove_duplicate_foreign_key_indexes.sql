-- Equivalent organisation indexes already existed on these tables. Keep the
-- established indexes and remove only the duplicate indexes added by the FK
-- coverage migration.
DROP INDEX IF EXISTS public.idx_fk_beds_organization_id_fkey;
DROP INDEX IF EXISTS public.idx_fk_lots_organization_id_fkey;
DROP INDEX IF EXISTS public.idx_fk_profiles_organization_id_fkey;
DROP INDEX IF EXISTS public.idx_fk_sites_organization_id_fkey;
DROP INDEX IF EXISTS public.idx_fk_user_roles_organization_id_fkey;
DROP INDEX IF EXISTS public.idx_fk_workers_organization_id_fkey;
