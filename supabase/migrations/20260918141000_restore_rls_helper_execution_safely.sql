-- RLS evaluates referenced functions as the requesting role. The previous
-- hardening migration correctly removed public access, but also removed the
-- authenticated grant required for active-tenant SELECT policies. Restore
-- that one grant while binding the function to the caller, preventing it from
-- becoming a cross-account organisation lookup endpoint.
CREATE OR REPLACE FUNCTION public.get_active_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_is_approved boolean;
  v_sub_status text;
BEGIN
  IF _user_id IS NULL OR _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT p.organization_id, p.is_approved, coalesce(o.subscription_status, 'active')
  INTO v_org_id, v_is_approved, v_sub_status
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_is_approved IS NOT TRUE OR v_sub_status = 'suspended' THEN
    RETURN NULL;
  END IF;

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_user_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_user_org_id(uuid) TO authenticated, service_role;
