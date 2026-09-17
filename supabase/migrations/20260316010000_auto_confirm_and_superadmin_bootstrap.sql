-- Migration: Auto-confirm user emails & Super Admin bootstrap
-- Description: Removes email verification requirement so accounts can sign in immediately,
--              subject to Super Admin approval. Adds secure bootstrap procedure for Super Admin.

-- 1. Auto-confirm email trigger for all new users in auth.users
CREATE OR REPLACE FUNCTION public.handle_auto_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_email ON auth.users;
CREATE TRIGGER trg_auto_confirm_email
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auto_confirm_email();

-- 2. Confirm all existing unconfirmed users
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

-- 3. Auto-confirm helper RPC callable by client after signup if trigger was not yet loaded
CREATE OR REPLACE FUNCTION public.fn_auto_confirm_user(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_auto_confirm_user TO anon, authenticated, service_role;

-- 4. Super Admin Bootstrap RPC
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

  -- Confirm email
  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: User with email % does not exist. Please register first.', p_email;
  END IF;

  -- Ensure profile exists
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

  -- Assign super_admin role
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (v_user_id, 'super_admin'::app_role, v_org_id)
  ON CONFLICT DO NOTHING;

  -- Log action
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

GRANT EXECUTE ON FUNCTION public.fn_bootstrap_super_admin TO anon, authenticated, service_role;

-- 5. Automatically elevate superadmin@coffeeops.internal if already registered
DO $$
DECLARE
  v_uid UUID;
  v_oid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'superadmin@coffeeops.internal';
  IF v_uid IS NOT NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_uid;
    
    SELECT organization_id INTO v_oid FROM public.profiles WHERE user_id = v_uid;
    IF v_oid IS NULL THEN
      INSERT INTO public.organizations (name) VALUES ('CoffeeOps Headquarters') RETURNING id INTO v_oid;
      INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved, is_super_admin)
      VALUES (v_uid, 'Platform Super Admin', 'superadmin@coffeeops.internal', v_oid, true, true)
      ON CONFLICT (user_id) DO UPDATE SET is_super_admin = true, is_approved = true;
    ELSE
      UPDATE public.profiles SET is_super_admin = true, is_approved = true WHERE user_id = v_uid;
    END IF;

    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (v_uid, 'super_admin'::app_role, v_oid)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
