
-- Extend lot_status enum with new statuses for grinding/shipment pipeline
ALTER TYPE public.lot_status ADD VALUE IF NOT EXISTS 'ready_for_grinding';
ALTER TYPE public.lot_status ADD VALUE IF NOT EXISTS 'grinding';
ALTER TYPE public.lot_status ADD VALUE IF NOT EXISTS 'ready_for_shipment';

-- Add final_weight to bed_assignments for completion tracking
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS final_weight numeric DEFAULT NULL;

-- Create grinding_batches table
CREATE TABLE public.grinding_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid REFERENCES public.lots(id) NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  dry_weight numeric NOT NULL,
  ground_weight numeric DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.grinding_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org grinding batches" ON public.grinding_batches
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Manage org grinding batches" ON public.grinding_batches
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));

-- Create shipments table
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid REFERENCES public.lots(id) NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) NOT NULL,
  weight numeric NOT NULL,
  destination text NOT NULL DEFAULT 'Addis Ababa Warehouse',
  shipment_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'preparing',
  confirmed_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org shipments" ON public.shipments
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Manage org shipments" ON public.shipments
  FOR ALL TO authenticated
  USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'manager')));
