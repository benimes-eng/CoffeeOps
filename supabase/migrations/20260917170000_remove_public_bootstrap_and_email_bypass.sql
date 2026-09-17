-- Emergency production hardening: remove development bootstrap paths that
-- exposed privileged credentials and disabled email ownership verification.

REVOKE ALL ON FUNCTION public.fn_bootstrap_super_admin(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_auto_confirm_user(text) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_bootstrap_super_admin(text, text);
DROP FUNCTION IF EXISTS public.fn_auto_confirm_user(text);
DROP TRIGGER IF EXISTS trg_auto_confirm_email ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auto_confirm_email();

-- Retire the known development account so its published credentials cannot
-- retain platform-level privileges. Promote a verified real administrator
-- through the Supabase SQL Editor before relying on platform administration.
SELECT set_config('coffeeops.bootstrap_super_admin', 'true', true);

DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(email) = 'superadmin@coffeeops.internal'
)
AND role = 'super_admin'::public.app_role;

UPDATE public.profiles
SET is_super_admin = false,
    is_approved = false
WHERE lower(email) = 'superadmin@coffeeops.internal';
