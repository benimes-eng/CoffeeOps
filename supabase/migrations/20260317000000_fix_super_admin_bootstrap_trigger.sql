-- Allow only the guarded bootstrap transaction to elevate its initial
-- platform administrator. This repairs databases that received the original
-- production-hardening trigger before the bootstrap exception was introduced.

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

CREATE OR REPLACE FUNCTION public.fn_bootstrap_super_admin(p_email text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  IF p_secret != 'CoffeeOps@SuperAdmin2026!' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Invalid bootstrap secret key';
  END IF;

  PERFORM set_config('coffeeops.bootstrap_super_admin', 'true', true);

  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: User with email % does not exist. Please register first.', p_email;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.profiles WHERE user_id = v_user_id;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name)
    VALUES ('Platform Administration')
    RETURNING id INTO v_org_id;

    INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved, is_super_admin)
    VALUES (v_user_id, 'Platform Super Admin', p_email, v_org_id, true, true)
    ON CONFLICT (user_id) DO UPDATE
    SET is_super_admin = true, is_approved = true;
  ELSE
    UPDATE public.profiles
    SET is_super_admin = true, is_approved = true
    WHERE user_id = v_user_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (v_user_id, 'super_admin'::app_role, v_org_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    v_org_id,
    'bootstrap',
    'user',
    v_user_id::TEXT,
    jsonb_build_object('action', 'super_admin_bootstrap', 'email', p_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Super admin privileges granted successfully to ' || p_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_bootstrap_super_admin(text, text) TO anon, authenticated, service_role;
