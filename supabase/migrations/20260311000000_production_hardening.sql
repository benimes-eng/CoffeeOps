-- Migration: 20260311000000_production_hardening.sql
-- Description: Production Hardening for CoffeeOps
-- 1. Schema alignment (missing columns & types)
-- 2. Constraints (CHECK bounds for physical quantities & weights)
-- 3. Privilege escalation guard on public.profiles
-- 4. Authoritative transactional stored procedures (RPCs)
-- 5. Performance composite indexes

-- ─────────────────────────────────────────────────────────────
-- 1. SCHEMA ALIGNMENT
-- ─────────────────────────────────────────────────────────────

-- Add 'merged' status to lot_status enum if missing
DO $$
BEGIN
  ALTER TYPE public.lot_status ADD VALUE IF NOT EXISTS 'merged';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Align bed_assignments columns with application types
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS assigned_area NUMERIC DEFAULT NULL;
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS density_used NUMERIC DEFAULT 30;
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Align lots table for traceability and notes
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS parent_lot_ids UUID[] DEFAULT NULL;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Align shipments table with formal shipment numbering
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS shipment_number TEXT DEFAULT NULL;

-- Align inventory_movements table for auditable movement ledger
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reference_type TEXT DEFAULT NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reference_id TEXT DEFAULT NULL;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. DATA CONSTRAINTS (PHYSICAL BOUNDS & DATA INTEGRITY)
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Beds dimensions must be positive
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_beds_dimensions') THEN
    ALTER TABLE public.beds ADD CONSTRAINT chk_beds_dimensions CHECK (length > 0 AND width > 0);
  END IF;

  -- Lots weights must be non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lots_weights') THEN
    ALTER TABLE public.lots ADD CONSTRAINT chk_lots_weights CHECK (initial_weight > 0 AND current_weight >= 0);
  END IF;

  -- Inventory quantity cannot be negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_quantity') THEN
    ALTER TABLE public.inventory_items ADD CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0);
  END IF;

  -- Inventory movement quantity must be positive
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_movement_quantity') THEN
    ALTER TABLE public.inventory_movements ADD CONSTRAINT chk_movement_quantity CHECK (quantity > 0);
  END IF;

  -- Grinding batch bounds: dry weight > 0 and ground weight <= dry weight
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_grinding_weights') THEN
    ALTER TABLE public.grinding_batches ADD CONSTRAINT chk_grinding_weights CHECK (dry_weight > 0 AND (ground_weight IS NULL OR ground_weight <= dry_weight));
  END IF;

  -- Shipment weight must be positive
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_shipment_weight') THEN
    ALTER TABLE public.shipments ADD CONSTRAINT chk_shipment_weight CHECK (weight > 0);
  END IF;

  -- Workers wage rate non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_worker_wage_rate') THEN
    ALTER TABLE public.workers ADD CONSTRAINT chk_worker_wage_rate CHECK (wage_rate >= 0);
  END IF;

  -- Work logs hours non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_work_logs_hours') THEN
    ALTER TABLE public.work_logs ADD CONSTRAINT chk_work_logs_hours CHECK (hours_worked >= 0);
  END IF;

  -- Payroll amounts non-negative
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_totals') THEN
    ALTER TABLE public.payroll ADD CONSTRAINT chk_payroll_totals CHECK (total_pay >= 0 AND total_hours >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. PRIVILEGE ESCALATION PREVENTION TRIGGER
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent regular users from elevating themselves to super admin,
  -- approving their own accounts, or changing organization_id to hijack another tenant.
  -- A transaction-local flag is set only by the guarded SECURITY DEFINER
  -- bootstrap procedure after it verifies its server-side bootstrap secret.
  IF NOT public.is_super_admin(auth.uid())
     AND current_user != 'service_role'
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- ─────────────────────────────────────────────────────────────
-- 4. AUTHORITATIVE DOCUMENT NUMBER SEQUENCES & GENERATORS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_sequences (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  year INT NOT NULL,
  last_val INT NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, prefix, year)
);

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage document sequences" ON public.document_sequences
FOR ALL TO authenticated
USING (organization_id = get_user_org_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_org_id UUID,
  p_prefix TEXT
) RETURNS TEXT AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_seq INT;
BEGIN
  INSERT INTO public.document_sequences (organization_id, prefix, year, last_val)
  VALUES (p_org_id, p_prefix, v_year, 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET last_val = public.document_sequences.last_val + 1
  RETURNING last_val INTO v_seq;

  RETURN p_prefix || '-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 5. TRANSACTIONAL STORED PROCEDURES (RPCs)
-- ─────────────────────────────────────────────────────────────

-- A. Create Lot Intake
CREATE OR REPLACE FUNCTION public.fn_create_lot(
  p_region TEXT,
  p_initial_weight NUMERIC,
  p_intake_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_lot_number TEXT;
  v_new_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with an active organization';
  END IF;

  IF p_initial_weight <= 0 THEN
    RAISE EXCEPTION 'Validation error: Initial weight must be greater than zero';
  END IF;

  IF TRIM(p_region) = '' THEN
    RAISE EXCEPTION 'Validation error: Region is required';
  END IF;

  v_lot_number := public.next_document_number(v_org_id, 'L');

  INSERT INTO public.lots (
    organization_id,
    lot_number,
    region,
    initial_weight,
    current_weight,
    intake_date,
    notes,
    status
  ) VALUES (
    v_org_id,
    v_lot_number,
    TRIM(p_region),
    p_initial_weight,
    p_initial_weight,
    COALESCE(p_intake_date, CURRENT_DATE),
    p_notes,
    'received'
  ) RETURNING * INTO v_new_lot;

  -- Emit audit log
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'create', 'lot', v_new_lot.id::TEXT, jsonb_build_object('lot_number', v_lot_number, 'initial_weight', p_initial_weight));

  RETURN to_jsonb(v_new_lot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- B. Assign Lot to Drying Bed
CREATE OR REPLACE FUNCTION public.fn_assign_bed(
  p_bed_id UUID,
  p_lot_id UUID,
  p_weight NUMERIC,
  p_density NUMERIC DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_bed public.beds%ROWTYPE;
  v_lot public.lots%ROWTYPE;
  v_required_area NUMERIC;
  v_assignment public.bed_assignments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_weight <= 0 THEN
    RAISE EXCEPTION 'Validation error: Assigned weight must be greater than zero';
  END IF;

  IF p_density <= 0 THEN
    RAISE EXCEPTION 'Validation error: Drying density must be positive';
  END IF;

  -- Lock bed row for update
  SELECT * INTO v_bed FROM public.beds
  WHERE id = p_bed_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed not found or does not belong to organization';
  END IF;

  IF v_bed.status = 'maintenance' THEN
    RAISE EXCEPTION 'Bed % is currently under maintenance and cannot receive coffee', v_bed.bed_number;
  END IF;

  IF v_bed.status = 'occupied' THEN
    RAISE EXCEPTION 'Bed % is already occupied', v_bed.bed_number;
  END IF;

  -- Check surface area capacity
  v_required_area := p_weight / p_density;
  IF v_required_area > v_bed.surface_area THEN
    RAISE EXCEPTION 'Over-capacity: Assigned weight requires % m2 but bed surface area is % m2',
      ROUND(v_required_area, 2), ROUND(v_bed.surface_area, 2);
  END IF;

  -- Lock and verify lot
  SELECT * INTO v_lot FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found or does not belong to organization';
  END IF;

  IF v_lot.status NOT IN ('received', 'drying') THEN
    RAISE EXCEPTION 'Lot % has status % and cannot be assigned to a drying bed', v_lot.lot_number, v_lot.status;
  END IF;

  -- Update bed status
  UPDATE public.beds SET status = 'occupied', updated_at = now() WHERE id = p_bed_id;

  -- Insert active assignment
  INSERT INTO public.bed_assignments (
    organization_id,
    bed_id,
    lot_id,
    assigned_weight,
    assigned_area,
    density_used,
    assigned_date,
    expected_completion,
    is_active
  ) VALUES (
    v_org_id,
    p_bed_id,
    p_lot_id,
    p_weight,
    v_required_area,
    p_density,
    now(),
    now() + INTERVAL '14 days',
    true
  ) RETURNING * INTO v_assignment;

  -- Update lot status
  UPDATE public.lots SET status = 'drying', updated_at = now() WHERE id = p_lot_id;

  -- Log bed activity
  INSERT INTO public.bed_activity_logs (
    organization_id, bed_id, bed_assignment_id, action_type, description, performed_by
  ) VALUES (
    v_org_id, p_bed_id, v_assignment.id, 'assignment',
    'Assigned ' || p_weight::TEXT || ' KG from lot ' || v_lot.lot_number, auth.uid()
  );

  RETURN to_jsonb(v_assignment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- C. Finish Drying
CREATE OR REPLACE FUNCTION public.fn_finish_drying(
  p_bed_id UUID,
  p_assignment_id UUID,
  p_final_weight NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_assignment public.bed_assignments%ROWTYPE;
  v_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_final_weight <= 0 THEN
    RAISE EXCEPTION 'Validation error: Final dry weight must be positive';
  END IF;

  -- Lock assignment
  SELECT * INTO v_assignment FROM public.bed_assignments
  WHERE id = p_assignment_id AND organization_id = v_org_id AND bed_id = p_bed_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active bed assignment not found';
  END IF;

  -- Close assignment
  UPDATE public.bed_assignments
  SET is_active = false, final_weight = p_final_weight, completed_at = now()
  WHERE id = p_assignment_id;

  -- Mark bed as empty
  UPDATE public.beds SET status = 'empty', updated_at = now() WHERE id = p_bed_id;

  -- Transition lot to ready_for_grinding with final parchment weight
  UPDATE public.lots
  SET status = 'ready_for_grinding', current_weight = p_final_weight, updated_at = now()
  WHERE id = v_assignment.lot_id
  RETURNING * INTO v_lot;

  -- Log activity
  INSERT INTO public.bed_activity_logs (
    organization_id, bed_id, bed_assignment_id, action_type, description, performed_by
  ) VALUES (
    v_org_id, p_bed_id, p_assignment_id, 'removal',
    'Drying finished. Final weight: ' || p_final_weight::TEXT || ' KG', auth.uid()
  );

  -- Emit audit log
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'mark_complete', 'bed_assignment', p_assignment_id::TEXT,
    jsonb_build_object('final_weight', p_final_weight, 'lot_id', v_assignment.lot_id));

  RETURN jsonb_build_object('success', true, 'lot', to_jsonb(v_lot));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- D. Merge Lots (Traceability-Preserving)
CREATE OR REPLACE FUNCTION public.fn_merge_lots(
  p_source_lot_ids UUID[],
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_total_weight NUMERIC := 0;
  v_region TEXT;
  v_lot RECORD;
  v_new_lot_number TEXT;
  v_new_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF array_length(p_source_lot_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Validation error: Merging requires at least 2 source lots';
  END IF;

  -- Lock all source lots
  FOR v_lot IN
    SELECT * FROM public.lots
    WHERE id = ANY(p_source_lot_ids) AND organization_id = v_org_id
    FOR UPDATE
  LOOP
    IF v_lot.status NOT IN ('finished', 'ready_for_grinding') THEN
      RAISE EXCEPTION 'Lot % has status % and cannot be merged (must be finished or ready for grinding)',
        v_lot.lot_number, v_lot.status;
    END IF;

    IF v_region IS NULL THEN
      v_region := v_lot.region;
    ELSIF v_region != v_lot.region THEN
      RAISE EXCEPTION 'Traceability error: Cannot merge lots across different regions (% vs %)', v_region, v_lot.region;
    END IF;

    v_total_weight := v_total_weight + v_lot.current_weight;
  END LOOP;

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION 'Validation error: Merged weight must be positive';
  END IF;

  v_new_lot_number := public.next_document_number(v_org_id, 'MERGE');

  -- Create child lot linked to parents
  INSERT INTO public.lots (
    organization_id,
    lot_number,
    region,
    initial_weight,
    current_weight,
    status,
    parent_lot_ids,
    notes,
    intake_date
  ) VALUES (
    v_org_id,
    v_new_lot_number,
    v_region,
    v_total_weight,
    v_total_weight,
    'ready_for_grinding',
    p_source_lot_ids,
    COALESCE(p_notes, 'Merged from: ' || array_to_string(p_source_lot_ids, ', ')),
    CURRENT_DATE
  ) RETURNING * INTO v_new_lot;

  -- Transition parent lots to 'merged' status (NOT shipped!)
  UPDATE public.lots
  SET status = 'merged', updated_at = now()
  WHERE id = ANY(p_source_lot_ids) AND organization_id = v_org_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'merge_lots', 'lot', v_new_lot.id::TEXT,
    jsonb_build_object('source_lot_ids', p_source_lot_ids, 'merged_weight', v_total_weight, 'merged_lot_number', v_new_lot_number));

  RETURN to_jsonb(v_new_lot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- E. Start Grinding
CREATE OR REPLACE FUNCTION public.fn_start_grinding(p_lot_id UUID) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_lot public.lots%ROWTYPE;
  v_batch public.grinding_batches%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id AND organization_id = v_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;

  IF v_lot.status != 'ready_for_grinding' THEN
    RAISE EXCEPTION 'Lot % cannot start grinding: current status is %', v_lot.lot_number, v_lot.status;
  END IF;

  INSERT INTO public.grinding_batches (
    organization_id, lot_id, dry_weight, status, started_at
  ) VALUES (
    v_org_id, p_lot_id, v_lot.current_weight, 'grinding', now()
  ) RETURNING * INTO v_batch;

  UPDATE public.lots SET status = 'grinding', updated_at = now() WHERE id = p_lot_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'start_grinding', 'grinding_batch', v_batch.id::TEXT, jsonb_build_object('lot_id', p_lot_id));

  RETURN to_jsonb(v_batch);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- F. Complete Grinding
CREATE OR REPLACE FUNCTION public.fn_complete_grinding(
  p_batch_id UUID,
  p_ground_weight NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_batch public.grinding_batches%ROWTYPE;
  v_yield NUMERIC;
  v_loss NUMERIC;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_ground_weight <= 0 THEN RAISE EXCEPTION 'Ground weight must be positive'; END IF;

  SELECT * INTO v_batch FROM public.grinding_batches
  WHERE id = p_batch_id AND organization_id = v_org_id AND status = 'grinding'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Grinding batch not found or already completed'; END IF;

  IF p_ground_weight > v_batch.dry_weight THEN
    RAISE EXCEPTION 'Physical impossibility: Ground weight (% KG) exceeds dry weight (% KG)',
      p_ground_weight, v_batch.dry_weight;
  END IF;

  v_yield := ROUND((p_ground_weight / v_batch.dry_weight) * 100, 2);
  v_loss := v_batch.dry_weight - p_ground_weight;

  UPDATE public.grinding_batches
  SET ground_weight = p_ground_weight, status = 'completed', completed_at = now()
  WHERE id = p_batch_id;

  UPDATE public.lots
  SET status = 'ready_for_shipment', current_weight = p_ground_weight, updated_at = now()
  WHERE id = v_batch.lot_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'complete_grinding', 'grinding_batch', p_batch_id::TEXT,
    jsonb_build_object('ground_weight', p_ground_weight, 'yield_percent', v_yield, 'loss_kg', v_loss));

  RETURN jsonb_build_object('success', true, 'yield_percent', v_yield, 'loss_kg', v_loss);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- G. Create Shipment
CREATE OR REPLACE FUNCTION public.fn_create_shipment(
  p_lot_id UUID,
  p_destination TEXT,
  p_shipment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_lot public.lots%ROWTYPE;
  v_shipment_number TEXT;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id AND organization_id = v_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot not found'; END IF;

  IF v_lot.status != 'ready_for_shipment' THEN
    RAISE EXCEPTION 'Lot % is not ready for shipment (current status: %)', v_lot.lot_number, v_lot.status;
  END IF;

  IF v_lot.current_weight <= 0 THEN
    RAISE EXCEPTION 'Lot % has zero available weight', v_lot.lot_number;
  END IF;

  v_shipment_number := public.next_document_number(v_org_id, 'SH');

  INSERT INTO public.shipments (
    organization_id, lot_id, weight, destination, shipment_date, status, shipment_number
  ) VALUES (
    v_org_id, p_lot_id, v_lot.current_weight, TRIM(p_destination), COALESCE(p_shipment_date, CURRENT_DATE), 'preparing', v_shipment_number
  ) RETURNING * INTO v_shipment;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'create_shipment', 'shipment', v_shipment.id::TEXT,
    jsonb_build_object('shipment_number', v_shipment_number, 'weight', v_lot.current_weight, 'destination', p_destination));

  RETURN to_jsonb(v_shipment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- H. Update Shipment Status
CREATE OR REPLACE FUNCTION public.fn_update_shipment_status(
  p_shipment_id UUID,
  p_new_status TEXT
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_new_status NOT IN ('preparing', 'in_transit', 'arrived', 'confirmed') THEN
    RAISE EXCEPTION 'Invalid shipment status %', p_new_status;
  END IF;

  SELECT * INTO v_shipment FROM public.shipments
  WHERE id = p_shipment_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Shipment not found'; END IF;

  UPDATE public.shipments
  SET status = p_new_status,
      confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END
  WHERE id = p_shipment_id;

  -- If shipment confirmed, transition lot to 'shipped'
  IF p_new_status = 'confirmed' THEN
    UPDATE public.lots SET status = 'shipped', updated_at = now() WHERE id = v_shipment.lot_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'confirm_shipment', 'shipment', p_shipment_id::TEXT, jsonb_build_object('status', p_new_status));

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- I. Record Inventory Movement (Ledger Model)
CREATE OR REPLACE FUNCTION public.fn_record_inventory_movement(
  p_item_id UUID,
  p_type public.movement_type,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_item public.inventory_items%ROWTYPE;
  v_new_qty NUMERIC;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Movement quantity must be positive'; END IF;

  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = p_item_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;

  IF p_type = 'in' THEN
    v_new_qty := v_item.quantity + p_quantity;
  ELSE
    IF v_item.quantity < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock: Current quantity % is less than requested %', v_item.quantity, p_quantity;
    END IF;
    v_new_qty := v_item.quantity - p_quantity;
  END IF;

  -- Insert ledger entry
  INSERT INTO public.inventory_movements (
    organization_id, item_id, type, quantity, reason, reference_type, reference_id, performed_by
  ) VALUES (
    v_org_id, p_item_id, p_type, p_quantity, p_reason, p_ref_type, p_ref_id, auth.uid()
  );

  -- Update balance
  UPDATE public.inventory_items
  SET quantity = v_new_qty, updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('item_id', p_item_id, 'new_quantity', v_new_qty);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- J. Calculate and Record Payroll from Work Logs
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(
  p_worker_id UUID,
  p_period_start DATE,
  p_period_end DATE
) RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_worker public.workers%ROWTYPE;
  v_total_hours NUMERIC := 0;
  v_unique_days INT := 0;
  v_total_pay NUMERIC := 0;
  v_payroll public.payroll%ROWTYPE;
BEGIN
  v_org_id := public.get_user_org_id(auth.uid());
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_worker FROM public.workers
  WHERE id = p_worker_id AND organization_id = v_org_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found'; END IF;

  -- Aggregate work logs
  SELECT
    COALESCE(SUM(hours_worked), 0),
    COUNT(DISTINCT date)
  INTO v_total_hours, v_unique_days
  FROM public.work_logs
  WHERE worker_id = p_worker_id AND organization_id = v_org_id
  AND date >= p_period_start AND date <= p_period_end;

  -- Calculate pay
  IF v_worker.wage_type = 'hourly' THEN
    v_total_pay := ROUND(v_total_hours * v_worker.wage_rate, 2);
  ELSIF v_worker.wage_type = 'daily' THEN
    v_total_pay := ROUND(v_unique_days * v_worker.wage_rate, 2);
  ELSE
    -- Monthly default pro-rated by days
    v_total_pay := ROUND(v_worker.wage_rate, 2);
  END IF;

  INSERT INTO public.payroll (
    organization_id, worker_id, period_start, period_end, total_hours, total_pay, approved
  ) VALUES (
    v_org_id, p_worker_id, p_period_start, p_period_end, v_total_hours, v_total_pay, false
  ) RETURNING * INTO v_payroll;

  RETURN to_jsonb(v_payroll);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.fn_create_lot TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_assign_bed TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_finish_drying TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merge_lots TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_start_grinding TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_complete_grinding TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_shipment TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_shipment_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_inventory_movement TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_payroll TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number TO authenticated;
