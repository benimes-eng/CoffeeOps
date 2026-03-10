
-- 1. Add is_super_admin flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 2. Self-signup owners should now be pending (not auto-approved) — super admin approves them
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  invited_org_id UUID;
  invited_role app_role;
BEGIN
  invited_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  
  IF invited_org_id IS NOT NULL THEN
    -- Invited user — pending org-level owner approval
    invited_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'worker');
    
    INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved, is_super_admin)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, invited_org_id, false, false);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, invited_role, invited_org_id);
  ELSE
    -- New self-signup — create org, pending super admin approval
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', SPLIT_PART(NEW.email, '@', 1) || '''s Farm'))
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved, is_super_admin)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, new_org_id, false, false);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, 'owner', new_org_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Create a security definer function to check super admin status
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND is_super_admin = true
  )
$$;

-- 4. Allow super admins to read ALL profiles (cross-org)
CREATE POLICY "Super admin view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

-- 5. Allow super admins to update any profile (for approval)
CREATE POLICY "Super admin update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (is_super_admin(auth.uid()));

-- 6. Allow super admins to view all organizations
CREATE POLICY "Super admin view all orgs" ON public.organizations
FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

-- 7. Allow super admins to view all user_roles
CREATE POLICY "Super admin view all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

-- 8. Allow super admins to view all audit logs
CREATE POLICY "Super admin view all audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));
