-- Migration: CRUD deletions and owner module data reset
-- Provides authoritative SECURITY DEFINER procedures for deleting individual records
-- and resetting operational module data scoped strictly to the authenticated tenant.

-- 1. Authoritative Lot Deletion
CREATE OR REPLACE FUNCTION public.fn_delete_lot(p_lot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_lot public.lots%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  SELECT * INTO v_lot FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lot not found or belongs to another organization';
  END IF;

  -- Clean up dependent operational child records safely
  DELETE FROM public.bed_assignments WHERE lot_id = p_lot_id;
  DELETE FROM public.grinding_batches WHERE lot_id = p_lot_id;
  DELETE FROM public.shipments WHERE lot_id = p_lot_id;
  DELETE FROM public.addis_hub_inventory WHERE lot_id = p_lot_id;
  DELETE FROM public.lots WHERE id = p_lot_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'delete',
    'lot',
    p_lot_id::TEXT,
    jsonb_build_object('lot_number', v_lot.lot_number, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'lot_id', p_lot_id, 'lot_number', v_lot.lot_number);
END;
$$;

-- 2. Authoritative Shipment Deletion
CREATE OR REPLACE FUNCTION public.fn_delete_shipment(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_shipment public.shipments%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  SELECT * INTO v_shipment FROM public.shipments
  WHERE id = p_shipment_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Shipment not found or belongs to another organization';
  END IF;

  DELETE FROM public.addis_hub_inventory WHERE shipment_id = p_shipment_id;
  DELETE FROM public.shipments WHERE id = p_shipment_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'delete',
    'shipment',
    p_shipment_id::TEXT,
    jsonb_build_object('destination', v_shipment.destination, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'shipment_id', p_shipment_id);
END;
$$;

-- 3. Authoritative Grinding Batch Deletion
CREATE OR REPLACE FUNCTION public.fn_delete_grinding_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_batch public.grinding_batches%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  SELECT * INTO v_batch FROM public.grinding_batches
  WHERE id = p_batch_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Grinding batch not found or belongs to another organization';
  END IF;

  DELETE FROM public.grinding_batches WHERE id = p_batch_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'delete',
    'grinding_batch',
    p_batch_id::TEXT,
    jsonb_build_object('deleted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id);
END;
$$;

-- 4. Authoritative Payroll Deletion
CREATE OR REPLACE FUNCTION public.fn_delete_payroll(p_payroll_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_payroll public.payroll%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);

  SELECT * INTO v_payroll FROM public.payroll
  WHERE id = p_payroll_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Payroll record not found or belongs to another organization';
  END IF;

  DELETE FROM public.payroll WHERE id = p_payroll_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'delete',
    'payroll',
    p_payroll_id::TEXT,
    jsonb_build_object('total_pay', v_payroll.total_pay, 'period_start', v_payroll.period_start, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'payroll_id', p_payroll_id);
END;
$$;

-- 5. Authoritative Module Data Reset (Owner Only)
CREATE OR REPLACE FUNCTION public.fn_reset_tenant_module_data(p_module TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_deleted_count INT := 0;
BEGIN
  -- Strict permission: Only owners can wipe module data
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner']::app_role[]);

  IF p_module = 'warehouse' OR p_module = 'lots' THEN
    -- Clear all lots and downstream processing
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.shipments WHERE organization_id = v_org_id;
    DELETE FROM public.grinding_batches WHERE organization_id = v_org_id;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;
    DELETE FROM public.lots WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix IN ('L', 'DRY', 'MERGE');

  ELSIF p_module = 'beds' THEN
    -- Reset drying bed assignments and activity logs
    DELETE FROM public.bed_activity_logs WHERE organization_id = v_org_id;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;

  ELSIF p_module = 'grinding' THEN
    -- Reset milling batches
    DELETE FROM public.grinding_batches WHERE organization_id = v_org_id;

  ELSIF p_module = 'shipments' THEN
    -- Reset outbound consignments
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.shipments WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix = 'SH';

  ELSIF p_module = 'addis_hub' THEN
    -- Reset Addis hub inventory and Djibouti dispatches
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix = 'DJIB';

  ELSIF p_module = 'payroll' THEN
    -- Reset payroll calculations and daily work logs
    DELETE FROM public.payroll WHERE organization_id = v_org_id;
    DELETE FROM public.work_logs WHERE organization_id = v_org_id;

  ELSIF p_module = 'inventory' THEN
    -- Reset warehouse equipment and movement ledger
    DELETE FROM public.inventory_movements WHERE organization_id = v_org_id;
    DELETE FROM public.inventory_items WHERE organization_id = v_org_id;

  ELSIF p_module = 'all' THEN
    -- Full operational wipe
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.shipments WHERE organization_id = v_org_id;
    DELETE FROM public.grinding_batches WHERE organization_id = v_org_id;
    DELETE FROM public.bed_activity_logs WHERE organization_id = v_org_id;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;
    DELETE FROM public.lots WHERE organization_id = v_org_id;
    DELETE FROM public.payroll WHERE organization_id = v_org_id;
    DELETE FROM public.work_logs WHERE organization_id = v_org_id;
    DELETE FROM public.inventory_movements WHERE organization_id = v_org_id;
    DELETE FROM public.inventory_items WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id;

  ELSE
    RAISE EXCEPTION 'INVALID_MODULE: Unknown module "%". Valid options: warehouse, beds, grinding, shipments, addis_hub, payroll, inventory, all', p_module;
  END IF;

  -- Record audit event
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    v_org_id,
    'reset_data',
    'module',
    p_module,
    jsonb_build_object('module', p_module, 'reset_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'module', p_module, 'organization_id', v_org_id);
END;
$$;

-- Grant execution to authenticated users (role checks are enforced inside function body)
REVOKE ALL ON FUNCTION public.fn_delete_lot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_lot(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_delete_shipment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_shipment(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_delete_grinding_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_grinding_batch(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_delete_payroll(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_payroll(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_reset_tenant_module_data(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reset_tenant_module_data(TEXT) TO authenticated, service_role;
