
-- 1. Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only owners/managers can view audit logs
CREATE POLICY "View org audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager'))
);

-- Any authenticated org member can insert audit logs
CREATE POLICY "Insert org audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = get_user_org_id(auth.uid())
  AND user_id = auth.uid()
);

-- 2. Add is_approved to profiles
ALTER TABLE public.profiles ADD COLUMN is_approved boolean NOT NULL DEFAULT false;

-- Auto-approve existing users
UPDATE public.profiles SET is_approved = true;

-- 3. Update handle_new_user to auto-approve self-signups (owners) and leave invited users as pending
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
    invited_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'worker');
    
    INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, invited_org_id, false);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, invited_role, invited_org_id);
  ELSE
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', SPLIT_PART(NEW.email, '@', 1) || '''s Farm'))
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.profiles (user_id, name, email, organization_id, is_approved)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, new_org_id, true);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, 'owner', new_org_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create index for performance
CREATE INDEX idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_profiles_is_approved ON public.profiles(organization_id, is_approved);
