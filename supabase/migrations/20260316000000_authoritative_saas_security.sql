-- ==============================================================================
-- Migration: 20260316000000_authoritative_saas_security.sql
-- Description: Comprehensive Production Hardening for CoffeeOps SaaS
-- 
-- 1. Single Reusable Database Authorization Model (User, Tenant, Role, State)
-- 2. Immutable Append-Only Audit Logging
-- 3. Workflow Table RLS Lockdown (Read-only for clients; mutations via RPC only)
-- 4. Invariant Integrity (Single active bed, single active grinding, valid weights)
-- 5. Authoritative, Atomic, Auditable Transactional Stored Procedures (RPCs)
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: SINGLE REUSABLE AUTHORIZATION MODEL
-- ─────────────────────────────────────────────────────────────

-- 1.1 Check if an actor is a verified platform super administrator
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND is_super_admin = true
  );
$$;

-- 1.2 Check if an actor profile is approved
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND is_approved = true
  );
$$;

-- 1.3 Check if an organization's subscription is active
CREATE OR REPLACE FUNCTION public.is_org_subscription_active(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id
    AND subscription_status = 'active'
  );
$$;

-- 1.4 Authoritative active organization resolver:
-- Returns organization_id ONLY IF:
-- - The user has a profile
-- - The user is approved (is_approved = true)
-- - The organization subscription is active (subscription_status = 'active')
CREATE OR REPLACE FUNCTION public.get_active_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_is_approved BOOLEAN;
  v_sub_status TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.organization_id, p.is_approved, COALESCE(o.subscription_status, 'active')
  INTO v_org_id, v_is_approved, v_sub_status
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.user_id = _user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Block if user is not approved
  IF v_is_approved IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Block if organization is suspended
  IF v_sub_status = 'suspended' THEN
    RETURN NULL;
  END IF;

  RETURN v_org_id;
END;
$$;

-- 1.5 Role check scoped strictly to an active organization
CREATE OR REPLACE FUNCTION public.has_active_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND ur.role = _role
    AND ur.organization_id = public.get_active_user_org_id(_user_id)
  );
$$;

-- 1.6 Any role check from a list of authorized roles
CREATE OR REPLACE FUNCTION public.has_any_active_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND ur.role = ANY(_roles)
    AND ur.organization_id = public.get_active_user_org_id(_user_id)
  );
$$;

-- 1.7 Enforce authoritative access in transactional RPCs
CREATE OR REPLACE FUNCTION public.assert_active_tenant_actor(
  p_required_roles app_role[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_org_id UUID;
  v_is_super BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Operation requires an authenticated session'
      USING ERRCODE = 'P0001';
  END IF;

  v_is_super := public.is_super_admin(v_uid);

  v_org_id := public.get_active_user_org_id(v_uid);
  IF v_org_id IS NULL AND NOT v_is_super THEN
    -- Provide specific diagnostics
    IF NOT public.is_user_approved(v_uid) THEN
      RAISE EXCEPTION 'ACCOUNT_PENDING_APPROVAL: Your account is awaiting administrator approval'
        USING ERRCODE = 'P0002';
    ELSE
      RAISE EXCEPTION 'SUBSCRIPTION_SUSPENDED: Farm system access is suspended due to billing'
        USING ERRCODE = 'P0003';
    END IF;
  END IF;

  IF p_required_roles IS NOT NULL AND array_length(p_required_roles, 1) > 0 THEN
    IF NOT v_is_super AND NOT public.has_any_active_role(v_uid, p_required_roles) THEN
      RAISE EXCEPTION 'FORBIDDEN_ROLE: Insufficient permissions for this operation'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  RETURN v_org_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: IMMUTABLE AUDIT LOGGING ENFORCEMENT
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY_VIOLATION: Audit logs are immutable and cannot be updated or deleted'
    USING ERRCODE = 'P0005';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_modification
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: INVARIANT INTEGRITY & CONSTRAINTS
-- ─────────────────────────────────────────────────────────────

-- 3.1 A bed can have at most one active bed assignment at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_single_active_assignment
ON public.bed_assignments (bed_id)
WHERE is_active = true;

-- 3.2 A lot can have at most one active grinding batch at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_lot_single_active_grinding
ON public.grinding_batches (lot_id)
WHERE status = 'grinding';

-- 3.3 Ensure positive document sequence counters
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_doc_seq_positive') THEN
    ALTER TABLE public.document_sequences ADD CONSTRAINT chk_doc_seq_positive CHECK (last_val > 0);
  END IF;
END $$;

-- 3.4 Strict document sequence generator with row locking
CREATE OR REPLACE FUNCTION public.next_document_number(
  p_org_id UUID,
  p_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_seq INT;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Cannot generate document sequence without organization';
  END IF;

  INSERT INTO public.document_sequences (organization_id, prefix, year, last_val)
  VALUES (p_org_id, p_prefix, v_year, 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET last_val = public.document_sequences.last_val + 1
  RETURNING last_val INTO v_seq;

  RETURN p_prefix || '-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4: WORKFLOW TABLE RLS LOCKDOWN
-- ─────────────────────────────────────────────────────────────
-- Browser direct INSERT, UPDATE, and DELETE on workflow tables are removed.
-- Clients must execute authoritative SECURITY DEFINER procedures.
-- Client SELECT remains enabled, tenant-scoped and gated by active subscription.

-- A. lots
DROP POLICY IF EXISTS "Manage lots" ON public.lots;
DROP POLICY IF EXISTS "View org lots" ON public.lots;
DROP POLICY IF EXISTS "Users can view lots" ON public.lots;
DROP POLICY IF EXISTS "Users can insert lots" ON public.lots;
DROP POLICY IF EXISTS "Users can update lots" ON public.lots;

CREATE POLICY "View active org lots" ON public.lots
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- B. bed_assignments
DROP POLICY IF EXISTS "Manage bed assignments" ON public.bed_assignments;
DROP POLICY IF EXISTS "View org bed assignments" ON public.bed_assignments;

CREATE POLICY "View active org bed assignments" ON public.bed_assignments
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- C. bed_activity_logs
DROP POLICY IF EXISTS "Insert bed activity logs" ON public.bed_activity_logs;
DROP POLICY IF EXISTS "View org bed activity logs" ON public.bed_activity_logs;

CREATE POLICY "View active org bed activity logs" ON public.bed_activity_logs
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- D. grinding_batches
DROP POLICY IF EXISTS "Manage grinding batches" ON public.grinding_batches;
DROP POLICY IF EXISTS "View org grinding batches" ON public.grinding_batches;

CREATE POLICY "View active org grinding batches" ON public.grinding_batches
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- E. shipments
DROP POLICY IF EXISTS "Manage shipments" ON public.shipments;
DROP POLICY IF EXISTS "View org shipments" ON public.shipments;

CREATE POLICY "View active org shipments" ON public.shipments
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- F. inventory_movements
DROP POLICY IF EXISTS "Manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Insert inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "View org inventory movements" ON public.inventory_movements;

CREATE POLICY "View active org inventory movements" ON public.inventory_movements
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- G. payroll
DROP POLICY IF EXISTS "Manage payroll" ON public.payroll;
DROP POLICY IF EXISTS "View org payroll" ON public.payroll;

CREATE POLICY "View active org payroll" ON public.payroll
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- H. addis_hub_inventory
DROP POLICY IF EXISTS "Manage org addis inventory" ON public.addis_hub_inventory;
DROP POLICY IF EXISTS "View org addis inventory" ON public.addis_hub_inventory;

CREATE POLICY "View active org addis inventory" ON public.addis_hub_inventory
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- I. djibouti_dispatches
DROP POLICY IF EXISTS "Manage org djibouti dispatches" ON public.djibouti_dispatches;
DROP POLICY IF EXISTS "View org djibouti dispatches" ON public.djibouti_dispatches;

CREATE POLICY "View active org djibouti dispatches" ON public.djibouti_dispatches
FOR SELECT TO authenticated
USING (
  organization_id = public.get_active_user_org_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: AUTHORITATIVE WORKFLOW STORED PROCEDURES (RPCs)
-- ─────────────────────────────────────────────────────────────

-- 5.1 Authoritative Lot Intake (Cherry or Direct Dried Coffee)
-- Replace the legacy four-argument overload created by the preceding
-- hardening migration before introducing this five-argument version.
DROP FUNCTION IF EXISTS public.fn_create_lot(TEXT, NUMERIC, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.fn_create_lot(
  p_region TEXT,
  p_initial_weight NUMERIC,
  p_intake_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_is_purchased_dry BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_lot_prefix TEXT;
  v_lot_number TEXT;
  v_status public.lot_status;
  v_new_lot public.lots%ROWTYPE;
BEGIN
  -- Require active user with owner, manager, or supervisor role
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'supervisor']::app_role[]);

  IF p_initial_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Initial intake weight must be greater than zero';
  END IF;

  IF TRIM(COALESCE(p_region, '')) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Coffee origin region is required';
  END IF;

  -- Determine prefix and initial status
  IF p_is_purchased_dry IS TRUE THEN
    v_lot_prefix := 'DRY';
    v_status := 'ready_for_grinding';
  ELSE
    v_lot_prefix := 'L';
    v_status := 'received';
  END IF;

  v_lot_number := public.next_document_number(v_org_id, v_lot_prefix);

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
    v_status
  )
  RETURNING * INTO v_new_lot;

  -- Authoritative audit trail
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'create',
    'lot',
    v_new_lot.id::TEXT,
    jsonb_build_object(
      'lot_number', v_lot_number,
      'initial_weight', p_initial_weight,
      'is_purchased_dry', p_is_purchased_dry,
      'region', p_region
    )
  );

  RETURN to_jsonb(v_new_lot);
END;
$$;

-- 5.2 Authoritative Drying Bed Assignment
CREATE OR REPLACE FUNCTION public.fn_assign_bed(
  p_bed_id UUID,
  p_lot_id UUID,
  p_weight NUMERIC,
  p_density NUMERIC DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_bed public.beds%ROWTYPE;
  v_lot public.lots%ROWTYPE;
  v_required_area NUMERIC;
  v_assignment public.bed_assignments%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'supervisor']::app_role[]);

  IF p_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Assigned weight must be positive';
  END IF;

  IF p_density <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Drying density must be positive';
  END IF;

  -- Lock bed and verify tenant consistency
  SELECT * INTO v_bed FROM public.beds
  WHERE id = p_bed_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Drying bed not found or does not belong to your organization';
  END IF;

  IF v_bed.status = 'maintenance' THEN
    RAISE EXCEPTION 'CONFLICT: Bed % is currently under maintenance', v_bed.bed_number;
  END IF;

  IF v_bed.status = 'occupied' THEN
    RAISE EXCEPTION 'CONFLICT: Bed % is already occupied', v_bed.bed_number;
  END IF;

  -- Physical surface area capacity validation
  v_required_area := p_weight / p_density;
  IF v_required_area > v_bed.surface_area THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: Assigned weight requires % m2 but bed capacity is % m2',
      ROUND(v_required_area, 2), ROUND(v_bed.surface_area, 2);
  END IF;

  -- Lock lot and verify tenant consistency
  SELECT * INTO v_lot FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lot not found or does not belong to your organization';
  END IF;

  IF v_lot.status NOT IN ('received', 'drying') THEN
    RAISE EXCEPTION 'INVALID_STATE: Lot % status is % (must be received or drying)', v_lot.lot_number, v_lot.status;
  END IF;

  -- Update bed status
  UPDATE public.beds SET status = 'occupied', updated_at = now() WHERE id = p_bed_id;

  -- Insert assignment
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
  )
  RETURNING * INTO v_assignment;

  -- Update lot status
  UPDATE public.lots SET status = 'drying', updated_at = now() WHERE id = p_lot_id;

  -- Activity log
  INSERT INTO public.bed_activity_logs (
    organization_id, bed_id, bed_assignment_id, action_type, description, performed_by
  ) VALUES (
    v_org_id, p_bed_id, v_assignment.id, 'assignment',
    'Assigned ' || p_weight::TEXT || ' KG from lot ' || v_lot.lot_number, auth.uid()
  );

  RETURN to_jsonb(v_assignment);
END;
$$;

-- 5.3 Authoritative Finish Drying Completion
CREATE OR REPLACE FUNCTION public.fn_finish_drying(
  p_bed_id UUID,
  p_assignment_id UUID,
  p_final_weight NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_assignment public.bed_assignments%ROWTYPE;
  v_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'supervisor']::app_role[]);

  IF p_final_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Final dry weight must be positive';
  END IF;

  -- Lock active assignment
  SELECT * INTO v_assignment FROM public.bed_assignments
  WHERE id = p_assignment_id AND organization_id = v_org_id AND bed_id = p_bed_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Active bed assignment not found';
  END IF;

  -- Close assignment atomically
  UPDATE public.bed_assignments
  SET is_active = false, final_weight = p_final_weight, completed_at = now()
  WHERE id = p_assignment_id;

  -- Free bed
  UPDATE public.beds SET status = 'empty', updated_at = now() WHERE id = p_bed_id;

  -- Advance lot to ready_for_grinding with final verified parchment weight
  UPDATE public.lots
  SET status = 'ready_for_grinding', current_weight = p_final_weight, updated_at = now()
  WHERE id = v_assignment.lot_id
  RETURNING * INTO v_lot;

  -- Activity log
  INSERT INTO public.bed_activity_logs (
    organization_id, bed_id, bed_assignment_id, action_type, description, performed_by
  ) VALUES (
    v_org_id, p_bed_id, p_assignment_id, 'removal',
    'Drying completed. Final dry weight: ' || p_final_weight::TEXT || ' KG', auth.uid()
  );

  -- Audit log
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'mark_complete',
    'bed_assignment',
    p_assignment_id::TEXT,
    jsonb_build_object('final_weight', p_final_weight, 'lot_id', v_assignment.lot_id)
  );

  RETURN jsonb_build_object('success', true, 'lot', to_jsonb(v_lot));
END;
$$;

-- 5.4 Authoritative Traceability-Preserving Lot Merge
CREATE OR REPLACE FUNCTION public.fn_merge_lots(
  p_source_lot_ids UUID[],
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_weight NUMERIC := 0;
  v_region TEXT;
  v_lot RECORD;
  v_new_lot_number TEXT;
  v_new_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  IF p_source_lot_ids IS NULL OR array_length(p_source_lot_ids, 1) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Merging requires at least 2 distinct source lots';
  END IF;

  -- Lock all source lots and verify tenant consistency and status
  FOR v_lot IN
    SELECT * FROM public.lots
    WHERE id = ANY(p_source_lot_ids) AND organization_id = v_org_id
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_lot.status NOT IN ('finished', 'ready_for_grinding') THEN
      RAISE EXCEPTION 'INVALID_STATE: Source lot % has status % (must be ready_for_grinding or finished)',
        v_lot.lot_number, v_lot.status;
    END IF;

    IF v_region IS NULL THEN
      v_region := v_lot.region;
    ELSIF v_region != v_lot.region THEN
      RAISE EXCEPTION 'TRACEABILITY_ERROR: Cannot merge lots from different origin regions (% vs %)',
        v_region, v_lot.region;
    END IF;

    v_total_weight := v_total_weight + v_lot.current_weight;
  END LOOP;

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Merged lot weight must be greater than zero';
  END IF;

  v_new_lot_number := public.next_document_number(v_org_id, 'MERGE');

  -- Create child lot
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
    COALESCE(p_notes, 'Merged from ' || array_length(p_source_lot_ids, 1)::TEXT || ' parent lots'),
    CURRENT_DATE
  )
  RETURNING * INTO v_new_lot;

  -- Transition all parent lots to 'merged' (never shipped!)
  UPDATE public.lots
  SET status = 'merged', updated_at = now()
  WHERE id = ANY(p_source_lot_ids) AND organization_id = v_org_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'merge_lots',
    'lot',
    v_new_lot.id::TEXT,
    jsonb_build_object(
      'merged_lot_number', v_new_lot_number,
      'total_weight', v_total_weight,
      'source_lot_ids', p_source_lot_ids
    )
  );

  RETURN to_jsonb(v_new_lot);
END;
$$;

-- 5.5 Authoritative Grinding Initiation
CREATE OR REPLACE FUNCTION public.fn_start_grinding(p_lot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_lot public.lots%ROWTYPE;
  v_batch public.grinding_batches%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  SELECT * INTO v_lot FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lot not found or does not belong to your organization';
  END IF;

  IF v_lot.status != 'ready_for_grinding' THEN
    RAISE EXCEPTION 'INVALID_STATE: Lot % status is % (must be ready_for_grinding)',
      v_lot.lot_number, v_lot.status;
  END IF;

  IF v_lot.current_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Lot has zero available weight for milling';
  END IF;

  INSERT INTO public.grinding_batches (
    organization_id, lot_id, dry_weight, status, started_at
  ) VALUES (
    v_org_id, p_lot_id, v_lot.current_weight, 'grinding', now()
  )
  RETURNING * INTO v_batch;

  UPDATE public.lots SET status = 'grinding', updated_at = now() WHERE id = p_lot_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'start_grinding',
    'grinding_batch',
    v_batch.id::TEXT,
    jsonb_build_object('lot_id', p_lot_id, 'dry_weight', v_lot.current_weight)
  );

  RETURN to_jsonb(v_batch);
END;
$$;

-- 5.6 Authoritative Grinding Completion
CREATE OR REPLACE FUNCTION public.fn_complete_grinding(
  p_batch_id UUID,
  p_ground_weight NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_batch public.grinding_batches%ROWTYPE;
  v_yield NUMERIC;
  v_loss NUMERIC;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  IF p_ground_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Ground coffee weight must be positive';
  END IF;

  SELECT * INTO v_batch FROM public.grinding_batches
  WHERE id = p_batch_id AND organization_id = v_org_id AND status = 'grinding'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Active grinding batch not found or already completed';
  END IF;

  IF p_ground_weight > v_batch.dry_weight THEN
    RAISE EXCEPTION 'PHYSICAL_VIOLATION: Ground weight (% KG) cannot exceed dry weight (% KG)',
      p_ground_weight, v_batch.dry_weight;
  END IF;

  v_yield := ROUND((p_ground_weight / v_batch.dry_weight) * 100, 2);
  v_loss := ROUND(v_batch.dry_weight - p_ground_weight, 2);

  UPDATE public.grinding_batches
  SET ground_weight = p_ground_weight,
      status = 'completed',
      completed_at = now()
  WHERE id = p_batch_id;

  UPDATE public.lots
  SET status = 'ready_for_shipment',
      current_weight = p_ground_weight,
      updated_at = now()
  WHERE id = v_batch.lot_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'complete_grinding',
    'grinding_batch',
    p_batch_id::TEXT,
    jsonb_build_object('ground_weight', p_ground_weight, 'yield_pct', v_yield, 'loss_kg', v_loss)
  );

  RETURN jsonb_build_object('success', true, 'yield_percent', v_yield, 'loss_kg', v_loss);
END;
$$;

-- 5.7 Authoritative Shipment Creation
CREATE OR REPLACE FUNCTION public.fn_create_shipment(
  p_lot_id UUID,
  p_destination TEXT,
  p_shipment_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_lot public.lots%ROWTYPE;
  v_shipment_number TEXT;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  IF TRIM(COALESCE(p_destination, '')) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Shipment destination is required';
  END IF;

  SELECT * INTO v_lot FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lot not found or does not belong to your organization';
  END IF;

  IF v_lot.status != 'ready_for_shipment' THEN
    RAISE EXCEPTION 'INVALID_STATE: Lot % status is % (must be ready_for_shipment)',
      v_lot.lot_number, v_lot.status;
  END IF;

  IF v_lot.current_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Lot has zero available weight for consignment';
  END IF;

  v_shipment_number := public.next_document_number(v_org_id, 'SH');

  INSERT INTO public.shipments (
    organization_id,
    lot_id,
    weight,
    destination,
    shipment_date,
    status,
    shipment_number
  ) VALUES (
    v_org_id,
    p_lot_id,
    v_lot.current_weight,
    TRIM(p_destination),
    COALESCE(p_shipment_date, CURRENT_DATE),
    'preparing',
    v_shipment_number
  )
  RETURNING * INTO v_shipment;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'create_shipment',
    'shipment',
    v_shipment.id::TEXT,
    jsonb_build_object(
      'shipment_number', v_shipment_number,
      'destination', p_destination,
      'weight', v_lot.current_weight
    )
  );

  RETURN to_jsonb(v_shipment);
END;
$$;

-- 5.8 Authoritative Shipment Transition
CREATE OR REPLACE FUNCTION public.fn_update_shipment_status(
  p_shipment_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'addis_warehouse']::app_role[]);

  SELECT * INTO v_shipment FROM public.shipments
  WHERE id = p_shipment_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Shipment not found or does not belong to your organization';
  END IF;

  -- Sequential state machine validation
  IF p_new_status = 'in_transit' THEN
    IF v_shipment.status != 'preparing' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Cannot transition from % to in_transit', v_shipment.status;
    END IF;
  ELSIF p_new_status = 'arrived' THEN
    IF v_shipment.status != 'in_transit' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Cannot transition from % to arrived', v_shipment.status;
    END IF;
  ELSIF p_new_status = 'confirmed' THEN
    IF v_shipment.status NOT IN ('arrived', 'in_transit') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Cannot transition from % to confirmed', v_shipment.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'VALIDATION_ERROR: Invalid target shipment status: %', p_new_status;
  END IF;

  UPDATE public.shipments
  SET status = p_new_status,
      confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END
  WHERE id = p_shipment_id;

  -- Transition lot to 'shipped' when consignment is formally confirmed
  IF p_new_status = 'confirmed' THEN
    UPDATE public.lots SET status = 'shipped', updated_at = now() WHERE id = v_shipment.lot_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'confirm_shipment',
    'shipment',
    p_shipment_id::TEXT,
    jsonb_build_object('from_status', v_shipment.status, 'to_status', p_new_status)
  );

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$;

-- 5.9 Authoritative Immutable Inventory Movement Ledger
CREATE OR REPLACE FUNCTION public.fn_record_inventory_movement(
  p_item_id UUID,
  p_type public.movement_type,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_item public.inventory_items%ROWTYPE;
  v_new_qty NUMERIC;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Movement quantity must be greater than zero';
  END IF;

  -- Lock item balance
  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = p_item_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Inventory item not found';
  END IF;

  IF p_type = 'in' THEN
    v_new_qty := v_item.quantity + p_quantity;
  ELSE
    IF v_item.quantity < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Current stock (% units) is less than requested withdrawal (% units)',
        v_item.quantity, p_quantity;
    END IF;
    v_new_qty := v_item.quantity - p_quantity;
  END IF;

  -- Insert immutable movement ledger entry
  INSERT INTO public.inventory_movements (
    organization_id,
    item_id,
    type,
    quantity,
    reason,
    reference_type,
    reference_id,
    performed_by
  ) VALUES (
    v_org_id,
    p_item_id,
    p_type,
    p_quantity,
    p_reason,
    p_ref_type,
    p_ref_id,
    auth.uid()
  );

  -- Update balance
  UPDATE public.inventory_items
  SET quantity = v_new_qty, updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('item_id', p_item_id, 'new_quantity', v_new_qty);
END;
$$;

-- 5.10 Authoritative Server-Side Payroll Generation
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(
  p_worker_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_worker public.workers%ROWTYPE;
  v_total_hours NUMERIC := 0;
  v_unique_days INT := 0;
  v_total_pay NUMERIC := 0;
  v_payroll public.payroll%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  IF p_period_start > p_period_end THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Payroll start date cannot be after end date';
  END IF;

  -- Prevent duplicate/overlapping periods for same worker
  IF EXISTS (
    SELECT 1 FROM public.payroll
    WHERE worker_id = p_worker_id
    AND organization_id = v_org_id
    AND (period_start, period_end) OVERLAPS (p_period_start, p_period_end)
  ) THEN
    RAISE EXCEPTION 'CONFLICT: A payroll record already exists overlapping this period for this worker';
  END IF;

  SELECT * INTO v_worker FROM public.workers
  WHERE id = p_worker_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Worker not found';
  END IF;

  -- Aggregate work logs
  SELECT
    COALESCE(SUM(hours_worked), 0),
    COUNT(DISTINCT date)
  INTO v_total_hours, v_unique_days
  FROM public.work_logs
  WHERE worker_id = p_worker_id
  AND organization_id = v_org_id
  AND date >= p_period_start
  AND date <= p_period_end;

  -- Calculation with deterministic ETB rounding
  IF v_worker.wage_type = 'hourly' THEN
    v_total_pay := ROUND(v_total_hours * v_worker.wage_rate, 2);
  ELSIF v_worker.wage_type = 'daily' THEN
    v_total_pay := ROUND(v_unique_days * v_worker.wage_rate, 2);
  ELSE
    v_total_pay := ROUND(v_worker.wage_rate, 2);
  END IF;

  INSERT INTO public.payroll (
    organization_id,
    worker_id,
    period_start,
    period_end,
    total_hours,
    total_pay,
    approved
  ) VALUES (
    v_org_id,
    p_worker_id,
    p_period_start,
    p_period_end,
    v_total_hours,
    v_total_pay,
    false
  )
  RETURNING * INTO v_payroll;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'create',
    'payroll',
    v_payroll.id::TEXT,
    jsonb_build_object('worker_id', p_worker_id, 'total_pay', v_total_pay, 'hours', v_total_hours)
  );

  RETURN to_jsonb(v_payroll);
END;
$$;

-- 5.11 Authoritative Payroll Approval
CREATE OR REPLACE FUNCTION public.fn_approve_payroll(p_payroll_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_payroll public.payroll%ROWTYPE;
BEGIN
  -- Only owners can approve payroll
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner']::app_role[]);

  SELECT * INTO v_payroll FROM public.payroll
  WHERE id = p_payroll_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Payroll record not found';
  END IF;

  IF v_payroll.approved IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true);
  END IF;

  UPDATE public.payroll
  SET approved = true
  WHERE id = p_payroll_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'update',
    'payroll',
    p_payroll_id::TEXT,
    jsonb_build_object('action', 'approve_payroll', 'total_pay', v_payroll.total_pay)
  );

  RETURN jsonb_build_object('success', true, 'approved', true);
END;
$$;

-- 5.12 Authoritative Addis Ababa Dry Port Consignment Intake
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
  v_org_id UUID;
  v_shipment RECORD;
  v_lot RECORD;
  v_hub_item_id UUID;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'addis_warehouse']::app_role[]);

  IF p_actual_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Received weight must be positive';
  END IF;

  IF p_moisture IS NOT NULL AND (p_moisture <= 0 OR p_moisture >= 30) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Moisture percentage must be between 0 and 30';
  END IF;

  SELECT * INTO v_shipment FROM public.shipments
  WHERE id = p_shipment_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Shipment not found or does not belong to your organization';
  END IF;

  IF v_shipment.status NOT IN ('in_transit', 'arrived') THEN
    RAISE EXCEPTION 'INVALID_STATE: Shipment status is % (must be in_transit or arrived to receive)', v_shipment.status;
  END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = v_shipment.lot_id;

  -- Confirm shipment arrival
  UPDATE public.shipments
  SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_shipment_id;

  -- Insert into central hub storage
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
    v_org_id,
    p_shipment_id,
    v_shipment.lot_id,
    COALESCE(v_lot.lot_number, 'CONSIGNMENT-' || SUBSTRING(v_shipment.id::text, 1, 8)),
    COALESCE(v_lot.region, 'Ethiopia Central'),
    p_actual_weight,
    p_actual_weight,
    p_moisture,
    COALESCE(NULLIF(TRIM(p_warehouse_bay), ''), 'Bay-A1'),
    now(),
    auth.uid(),
    'in_storage'
  )
  RETURNING id INTO v_hub_item_id;

  -- Transition lot to 'shipped'
  IF v_shipment.lot_id IS NOT NULL THEN
    UPDATE public.lots SET status = 'shipped', updated_at = now() WHERE id = v_shipment.lot_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'create',
    'shipment',
    p_shipment_id::TEXT,
    jsonb_build_object(
      'action', 'receive_addis_hub',
      'hub_item_id', v_hub_item_id,
      'actual_weight', p_actual_weight,
      'moisture', p_moisture,
      'bay', p_warehouse_bay
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hub_item_id', v_hub_item_id,
    'message', 'Consignment successfully checked into Addis Ababa Dry Port Inventory'
  );
END;
$$;

-- 5.13 Authoritative Djibouti Port Container Dispatch
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
  v_org_id UUID;
  v_hub_item RECORD;
  v_dispatch_num TEXT;
  v_dispatch_id UUID;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager', 'addis_warehouse']::app_role[]);

  IF p_dispatch_weight <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Dispatch weight must be greater than zero';
  END IF;

  IF TRIM(COALESCE(p_container_number, '')) = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Container number is required for export dispatch';
  END IF;

  SELECT * INTO v_hub_item FROM public.addis_hub_inventory
  WHERE id = p_hub_inventory_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Hub inventory record not found';
  END IF;

  IF v_hub_item.current_weight < p_dispatch_weight THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Requested dispatch weight (% KG) exceeds stock (% KG)',
      p_dispatch_weight, v_hub_item.current_weight;
  END IF;

  -- Collision-safe document sequence for Djibouti export dispatch
  v_dispatch_num := public.next_document_number(v_org_id, 'DJIB');

  -- Deduct inventory atomically
  UPDATE public.addis_hub_inventory
  SET current_weight = current_weight - p_dispatch_weight,
      status = CASE WHEN current_weight - p_dispatch_weight <= 0 THEN 'shipped_to_port' ELSE 'in_storage' END
  WHERE id = p_hub_inventory_id;

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
    v_org_id,
    p_hub_inventory_id,
    v_dispatch_num,
    TRIM(p_container_number),
    TRIM(p_vessel_name),
    TRIM(p_booking_ref),
    TRIM(p_seal_number),
    p_dispatch_weight,
    CURRENT_DATE,
    p_expected_arrival,
    'dispatched'
  )
  RETURNING id INTO v_dispatch_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'create',
    'shipment',
    v_dispatch_id::TEXT,
    jsonb_build_object(
      'action', 'dispatch_djibouti',
      'dispatch_number', v_dispatch_num,
      'container', p_container_number,
      'weight', p_dispatch_weight
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispatch_id', v_dispatch_id,
    'dispatch_number', v_dispatch_num
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: REVOKE & RESTRICT EXECUTION PRIVILEGES
-- ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.is_super_admin FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_user_approved FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_approved TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_subscription_active FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_subscription_active TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_active_user_org_id FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_user_org_id TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_role FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_role TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_any_active_role FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_active_role TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_active_tenant_actor FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_active_tenant_actor TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.next_document_number FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_create_lot(TEXT, NUMERIC, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_lot(TEXT, NUMERIC, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_assign_bed FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_bed TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_finish_drying FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finish_drying TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_merge_lots FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_merge_lots TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_start_grinding FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_start_grinding TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_complete_grinding FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_grinding TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_create_shipment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_shipment TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_update_shipment_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_shipment_status TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_record_inventory_movement FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_inventory_movement TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_generate_payroll FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generate_payroll TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_approve_payroll FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_approve_payroll TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_receive_at_addis_hub FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_receive_at_addis_hub TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_dispatch_to_djibouti FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dispatch_to_djibouti TO authenticated, service_role;
