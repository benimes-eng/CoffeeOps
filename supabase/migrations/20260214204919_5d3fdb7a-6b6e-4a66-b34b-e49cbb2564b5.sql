
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'supervisor', 'worker');

-- User roles table (security best practice - separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'worker',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  site_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Sites
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Blocks
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Beds
CREATE TYPE public.bed_status AS ENUM ('empty', 'occupied', 'maintenance');

CREATE TABLE public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES public.blocks(id) ON DELETE CASCADE NOT NULL,
  bed_number TEXT NOT NULL,
  length NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 0,
  surface_area NUMERIC GENERATED ALWAYS AS (length * width) STORED,
  material_type TEXT,
  status bed_status NOT NULL DEFAULT 'empty',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

-- Lots
CREATE TYPE public.lot_status AS ENUM ('received', 'drying', 'finished', 'shipped');

CREATE TABLE public.lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number TEXT NOT NULL UNIQUE,
  intake_date DATE NOT NULL DEFAULT CURRENT_DATE,
  region TEXT NOT NULL,
  initial_weight NUMERIC NOT NULL,
  current_weight NUMERIC NOT NULL,
  status lot_status NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

-- Bed Assignments
CREATE TABLE public.bed_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_id UUID REFERENCES public.beds(id) ON DELETE CASCADE NOT NULL,
  lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE NOT NULL,
  assigned_weight NUMERIC NOT NULL,
  assigned_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_completion TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bed_assignments ENABLE ROW LEVEL SECURITY;

-- Bed Activity Logs (immutable)
CREATE TYPE public.bed_action_type AS ENUM ('turning', 'cleaning', 'inspection', 'assignment', 'removal', 'maintenance_start', 'maintenance_end');

CREATE TABLE public.bed_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_assignment_id UUID REFERENCES public.bed_assignments(id),
  bed_id UUID REFERENCES public.beds(id) NOT NULL,
  action_type bed_action_type NOT NULL,
  description TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bed_activity_logs ENABLE ROW LEVEL SECURITY;

-- Workers
CREATE TYPE public.wage_type AS ENUM ('daily', 'hourly', 'monthly');
CREATE TYPE public.worker_status AS ENUM ('active', 'on_leave', 'terminated');

CREATE TABLE public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  wage_type wage_type NOT NULL DEFAULT 'daily',
  wage_rate NUMERIC NOT NULL DEFAULT 0,
  status worker_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Work Logs
CREATE TABLE public.work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  hours_worked NUMERIC NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- Payroll
CREATE TABLE public.payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours NUMERIC NOT NULL DEFAULT 0,
  total_pay NUMERIC NOT NULL DEFAULT 0,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- Inventory Items
CREATE TYPE public.inventory_category AS ENUM ('machinery', 'equipment', 'consumable');

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category inventory_category NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  location TEXT,
  status TEXT DEFAULT 'available',
  last_service_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- Inventory Movements
CREATE TYPE public.movement_type AS ENUM ('in', 'out');

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
  type movement_type NOT NULL,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_beds_updated_at BEFORE UPDATE ON public.beds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lots_updated_at BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'worker');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies: Authenticated users can read all operational data
-- Profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- User roles
CREATE POLICY "Users can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Sites, Blocks, Beds - readable by all authenticated, writable by managers+
CREATE POLICY "Read sites" ON public.sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage sites" ON public.sites FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Read blocks" ON public.blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage blocks" ON public.blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Read beds" ON public.beds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage beds" ON public.beds FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- Lots
CREATE POLICY "Read lots" ON public.lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage lots" ON public.lots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- Bed Assignments
CREATE POLICY "Read bed_assignments" ON public.bed_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage bed_assignments" ON public.bed_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'supervisor'));

-- Bed Activity Logs
CREATE POLICY "Read bed_activity_logs" ON public.bed_activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert bed_activity_logs" ON public.bed_activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Workers
CREATE POLICY "Read workers" ON public.workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage workers" ON public.workers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- Work Logs
CREATE POLICY "Read work_logs" ON public.work_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert work_logs" ON public.work_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Payroll
CREATE POLICY "Read payroll" ON public.payroll FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll" ON public.payroll FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- Inventory Items
CREATE POLICY "Read inventory_items" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage inventory_items" ON public.inventory_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- Inventory Movements
CREATE POLICY "Read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert inventory_movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
