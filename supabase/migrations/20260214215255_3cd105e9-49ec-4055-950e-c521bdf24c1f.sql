
-- 1. Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Create default organization for existing data
INSERT INTO public.organizations (id, name) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'CoffeeOps Estate');

-- 3. Add organization_id to all tables
ALTER TABLE public.profiles ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.sites ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.blocks ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.beds ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.lots ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bed_assignments ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.bed_activity_logs ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.workers ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.payroll ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.work_logs ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.inventory_items ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.inventory_movements ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.user_roles ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- 4. Backfill existing data with default org
UPDATE public.profiles SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.sites SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.blocks SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.beds SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.lots SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bed_assignments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.bed_activity_logs SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.workers SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.payroll SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.work_logs SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.inventory_items SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.inventory_movements SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.user_roles SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- 5. Make organization_id NOT NULL
ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.sites ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.blocks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.beds ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.lots ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bed_assignments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.bed_activity_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.workers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.payroll ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.work_logs ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.inventory_movements ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;

-- 6. Helper function to get user's org
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 7. Update has_role to be org-scoped
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role = _role 
    AND organization_id = get_user_org_id(_user_id)
  )
$$;

-- 8. Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 9. Drop ALL existing RLS policies
DROP POLICY IF EXISTS "Manage sites" ON public.sites;
DROP POLICY IF EXISTS "Read sites" ON public.sites;
DROP POLICY IF EXISTS "Manage blocks" ON public.blocks;
DROP POLICY IF EXISTS "Read blocks" ON public.blocks;
DROP POLICY IF EXISTS "Manage beds" ON public.beds;
DROP POLICY IF EXISTS "Read beds" ON public.beds;
DROP POLICY IF EXISTS "Manage lots" ON public.lots;
DROP POLICY IF EXISTS "Read lots" ON public.lots;
DROP POLICY IF EXISTS "Manage bed_assignments" ON public.bed_assignments;
DROP POLICY IF EXISTS "Read bed_assignments" ON public.bed_assignments;
DROP POLICY IF EXISTS "Insert bed_activity_logs" ON public.bed_activity_logs;
DROP POLICY IF EXISTS "Read bed_activity_logs" ON public.bed_activity_logs;
DROP POLICY IF EXISTS "Insert bed_activity_logs " ON public.bed_activity_logs;
DROP POLICY IF EXISTS "Read bed_activity_logs " ON public.bed_activity_logs;
DROP POLICY IF EXISTS "Manage workers" ON public.workers;
DROP POLICY IF EXISTS "Read workers" ON public.workers;
DROP POLICY IF EXISTS "Manage payroll" ON public.payroll;
DROP POLICY IF EXISTS "Read payroll" ON public.payroll;
DROP POLICY IF EXISTS "Insert work_logs" ON public.work_logs;
DROP POLICY IF EXISTS "Read work_logs" ON public.work_logs;
DROP POLICY IF EXISTS "Insert work_logs " ON public.work_logs;
DROP POLICY IF EXISTS "Read work_logs " ON public.work_logs;
DROP POLICY IF EXISTS "Manage inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Read inventory_items" ON public.inventory_items;
DROP POLICY IF EXISTS "Insert inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Read inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Insert inventory_movements " ON public.inventory_movements;
DROP POLICY IF EXISTS "Read inventory_movements " ON public.inventory_movements;
DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- 10. Create new org-scoped RLS policies

-- organizations
CREATE POLICY "View own org" ON public.organizations
  FOR SELECT USING (id = get_user_org_id(auth.uid()));

-- profiles
CREATE POLICY "View org profiles" ON public.profiles
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- sites
CREATE POLICY "View org sites" ON public.sites
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org sites" ON public.sites
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- blocks
CREATE POLICY "View org blocks" ON public.blocks
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org blocks" ON public.blocks
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- beds
CREATE POLICY "View org beds" ON public.beds
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org beds" ON public.beds
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- lots
CREATE POLICY "View org lots" ON public.lots
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org lots" ON public.lots
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- bed_assignments
CREATE POLICY "View org assignments" ON public.bed_assignments
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org assignments" ON public.bed_assignments
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'supervisor')));

-- bed_activity_logs
CREATE POLICY "View org activity logs" ON public.bed_activity_logs
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Insert org activity logs" ON public.bed_activity_logs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND performed_by = auth.uid());

-- workers
CREATE POLICY "View org workers" ON public.workers
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org workers" ON public.workers
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- payroll
CREATE POLICY "View org payroll" ON public.payroll
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org payroll" ON public.payroll
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- work_logs
CREATE POLICY "View org work logs" ON public.work_logs
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Insert org work logs" ON public.work_logs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'supervisor')));

-- inventory_items
CREATE POLICY "View org inventory" ON public.inventory_items
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Manage org inventory" ON public.inventory_items
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- inventory_movements
CREATE POLICY "View org movements" ON public.inventory_movements
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Insert org movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- user_roles
CREATE POLICY "View org roles" ON public.user_roles
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Owners manage org roles" ON public.user_roles
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'owner'));

-- notifications
CREATE POLICY "View own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- 11. Update handle_new_user for SaaS signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  invited_org_id UUID;
  invited_role app_role;
BEGIN
  -- Check if user was invited to an existing org
  invited_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  
  IF invited_org_id IS NOT NULL THEN
    -- Invited user - join existing org
    invited_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'worker');
    
    INSERT INTO public.profiles (user_id, name, email, organization_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, invited_org_id);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, invited_role, invited_org_id);
  ELSE
    -- New signup - create own org
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', SPLIT_PART(NEW.email, '@', 1) || '''s Farm'))
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.profiles (user_id, name, email, organization_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, new_org_id);
    
    INSERT INTO public.user_roles (user_id, role, organization_id) 
    VALUES (NEW.id, 'owner', new_org_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 12. Notification trigger for bed events
CREATE OR REPLACE FUNCTION public.notify_on_bed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _title TEXT;
  _message TEXT;
  _type TEXT;
  _bed_number TEXT;
  _user RECORD;
BEGIN
  SELECT bed_number INTO _bed_number FROM public.beds WHERE id = NEW.bed_id;

  IF NEW.action_type IN ('maintenance_start', 'maintenance_flag') THEN
    _title := 'Maintenance Alert';
    _message := 'Bed ' || COALESCE(_bed_number, 'Unknown') || ' requires maintenance. ' || COALESCE(NEW.description, '');
    _type := 'warning';
  ELSIF NEW.action_type = 'assignment' THEN
    _title := 'New Coffee Assignment';
    _message := 'Coffee assigned to Bed ' || COALESCE(_bed_number, 'Unknown');
    _type := 'info';
  ELSIF NEW.action_type = 'finished' THEN
    _title := 'Bed Ready for Collection';
    _message := 'Bed ' || COALESCE(_bed_number, 'Unknown') || ' is finished drying and ready.';
    _type := 'success';
  ELSE
    RETURN NEW;
  END IF;

  FOR _user IN 
    SELECT ur.user_id FROM public.user_roles ur 
    WHERE ur.organization_id = NEW.organization_id 
    AND ur.role IN ('owner', 'manager')
    AND ur.user_id != NEW.performed_by
  LOOP
    INSERT INTO public.notifications (user_id, organization_id, title, message, type)
    VALUES (_user.user_id, NEW.organization_id, _title, _message, _type);
  END LOOP;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_bed_events
  AFTER INSERT ON public.bed_activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_bed_event();

-- 13. Indexes for performance
CREATE INDEX idx_profiles_org ON public.profiles(organization_id);
CREATE INDEX idx_sites_org ON public.sites(organization_id);
CREATE INDEX idx_beds_org ON public.beds(organization_id);
CREATE INDEX idx_lots_org ON public.lots(organization_id);
CREATE INDEX idx_workers_org ON public.workers(organization_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);
CREATE INDEX idx_user_roles_org ON public.user_roles(organization_id);
