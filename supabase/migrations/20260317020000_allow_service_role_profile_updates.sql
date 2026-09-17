-- Supabase Edge Functions use a service-role JWT. In a SECURITY DEFINER
-- trigger, current_user is the function owner rather than that JWT role, so
-- authorization must use auth.role() to allow server-authorized approval and
-- suspension updates while continuing to block browser-side privilege changes.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid())
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND current_setting('coffeeops.bootstrap_super_admin', true) IS DISTINCT FROM 'true' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only platform administrators can modify is_super_admin';
    END IF;
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'Unauthorized: User approval state cannot be modified directly';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Unauthorized: Tenant association (organization_id) is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
