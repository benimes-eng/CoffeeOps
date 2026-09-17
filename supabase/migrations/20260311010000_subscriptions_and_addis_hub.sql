-- ==============================================================================
-- CoffeeOps Migration: Subscriptions, Roles & Addis Ababa Hub
-- Date: 2026-03-11
-- ==============================================================================

-- 1. Extend app_role to include 'addis_warehouse' and 'super_admin' if not present
DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'addis_warehouse';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add subscription management fields to organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active' 
    CHECK (subscription_status IN ('active', 'past_due', 'suspended')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS next_billing_date DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days');

-- 3. Create addis_hub_inventory table for coffee arrived and stored at Addis Ababa dry port
CREATE TABLE IF NOT EXISTS public.addis_hub_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES public.shipments(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  lot_number TEXT NOT NULL,
  region TEXT NOT NULL,
  incoming_weight NUMERIC NOT NULL CHECK (incoming_weight > 0),
  current_weight NUMERIC NOT NULL CHECK (current_weight >= 0),
  moisture_percentage NUMERIC CHECK (moisture_percentage > 0 AND moisture_percentage < 30),
  warehouse_bay TEXT NOT NULL DEFAULT 'Bay-A1',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'in_storage' CHECK (status IN ('in_storage', 'staged_for_export', 'shipped_to_port')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.addis_hub_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org addis inventory" ON public.addis_hub_inventory
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Manage org addis inventory" ON public.addis_hub_inventory
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- 4. Create djibouti_dispatches table for container export shipments from Addis to Djibouti Port
CREATE TABLE IF NOT EXISTS public.djibouti_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hub_inventory_id UUID NOT NULL REFERENCES public.addis_hub_inventory(id) ON DELETE RESTRICT,
  dispatch_number TEXT NOT NULL UNIQUE,
  container_number TEXT NOT NULL,
  vessel_name TEXT NOT NULL,
  booking_reference TEXT NOT NULL,
  seal_number TEXT NOT NULL,
  total_weight NUMERIC NOT NULL CHECK (total_weight > 0),
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_port_arrival DATE,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'in_transit_port', 'arrived_djibouti', 'loaded_on_vessel')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.djibouti_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org djibouti dispatches" ON public.djibouti_dispatches
  FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Manage org djibouti dispatches" ON public.djibouti_dispatches
  FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- 5. Stored procedure to receive shipment into Addis Ababa Hub
CREATE OR REPLACE FUNCTION public.fn_receive_at_addis_hub(
  p_shipment_id UUID,
  p_actual_weight NUMERIC,
  p_moisture NUMERIC,
  p_warehouse_bay TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipment RECORD;
  v_lot RECORD;
  v_hub_item_id UUID;
BEGIN
  SELECT * INTO v_shipment FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment not found';
  END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = v_shipment.lot_id;

  -- Mark shipment as confirmed / arrived in Addis
  UPDATE public.shipments
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_shipment_id;

  -- Insert into Addis central inventory
  INSERT INTO public.addis_hub_inventory (
    organization_id,
    shipment_id,
    lot_id,
    lot_number,
    region,
    incoming_weight,
    current_weight,
    moisture_percentage,
    warehouse_bay,
    received_at,
    received_by,
    status
  ) VALUES (
    v_shipment.organization_id,
    p_shipment_id,
    v_shipment.lot_id,
    COALESCE(v_lot.lot_number, 'CONSIGNMENT-' || SUBSTRING(v_shipment.id::text, 1, 8)),
    COALESCE(v_lot.region, 'Ethiopia Central'),
    p_actual_weight,
    p_actual_weight,
    p_moisture,
    p_warehouse_bay,
    now(),
    auth.uid(),
    'in_storage'
  )
  RETURNING id INTO v_hub_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'hub_item_id', v_hub_item_id,
    'message', 'Consignment successfully checked into Addis Ababa Dry Port Inventory'
  );
END;
$$;

-- 6. Stored procedure to dispatch from Addis to Djibouti
CREATE OR REPLACE FUNCTION public.fn_dispatch_to_djibouti(
  p_hub_inventory_id UUID,
  p_container_number TEXT,
  p_vessel_name TEXT,
  p_booking_ref TEXT,
  p_seal_number TEXT,
  p_dispatch_weight NUMERIC,
  p_expected_arrival DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hub_item RECORD;
  v_dispatch_num TEXT;
  v_dispatch_id UUID;
BEGIN
  SELECT * INTO v_hub_item FROM public.addis_hub_inventory WHERE id = p_hub_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub inventory lot not found';
  END IF;

  IF v_hub_item.current_weight < p_dispatch_weight THEN
    RAISE EXCEPTION 'Dispatch weight (%) exceeds available warehouse stock (%)', p_dispatch_weight, v_hub_item.current_weight;
  END IF;

  v_dispatch_num := 'DJIB-EXP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');

  -- Deduct or mark hub item
  UPDATE public.addis_hub_inventory
  SET current_weight = current_weight - p_dispatch_weight,
      status = CASE WHEN current_weight - p_dispatch_weight <= 0 THEN 'shipped_to_port' ELSE 'in_storage' END
  WHERE id = p_hub_inventory_id;

  -- Create dispatch record
  INSERT INTO public.djibouti_dispatches (
    organization_id,
    hub_inventory_id,
    dispatch_number,
    container_number,
    vessel_name,
    booking_reference,
    seal_number,
    total_weight,
    dispatch_date,
    expected_port_arrival,
    status
  ) VALUES (
    v_hub_item.organization_id,
    p_hub_inventory_id,
    v_dispatch_num,
    p_container_number,
    p_vessel_name,
    p_booking_ref,
    p_seal_number,
    p_dispatch_weight,
    CURRENT_DATE,
    p_expected_arrival,
    'dispatched'
  )
  RETURNING id INTO v_dispatch_id;

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_number', v_dispatch_num
  );
END;
$$;
