-- Repair dependency ordering and make the remaining Inventory and Work Logs
-- maintenance actions tenant-authoritative.  This intentionally preserves
-- inventory ledger history: items with movements cannot be individually deleted.

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

  SELECT * INTO v_lot
  FROM public.lots
  WHERE id = p_lot_id AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lot not found or belongs to another organization';
  END IF;

  -- These are ordered by foreign-key dependencies, rather than relying on
  -- application-side deletes that could leave a partial operation behind.
  DELETE FROM public.bed_activity_logs
  WHERE organization_id = v_org_id
    AND bed_assignment_id IN (
      SELECT id FROM public.bed_assignments
      WHERE lot_id = p_lot_id AND organization_id = v_org_id
    );
  DELETE FROM public.djibouti_dispatches
  WHERE organization_id = v_org_id
    AND hub_inventory_id IN (
      SELECT id FROM public.addis_hub_inventory
      WHERE lot_id = p_lot_id AND organization_id = v_org_id
    );
  DELETE FROM public.addis_hub_inventory
  WHERE lot_id = p_lot_id AND organization_id = v_org_id;
  DELETE FROM public.shipments
  WHERE lot_id = p_lot_id AND organization_id = v_org_id;
  DELETE FROM public.grinding_batches
  WHERE lot_id = p_lot_id AND organization_id = v_org_id;
  DELETE FROM public.bed_assignments
  WHERE lot_id = p_lot_id AND organization_id = v_org_id;
  DELETE FROM public.lots WHERE id = p_lot_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'delete', 'lot', p_lot_id::TEXT,
          jsonb_build_object('lot_number', v_lot.lot_number, 'deleted_at', NOW()));

  RETURN jsonb_build_object('success', true, 'lot_id', p_lot_id, 'lot_number', v_lot.lot_number);
END;
$$;

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
  WHERE id = p_shipment_id AND organization_id = v_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Shipment not found or belongs to another organization';
  END IF;

  DELETE FROM public.djibouti_dispatches
  WHERE organization_id = v_org_id
    AND hub_inventory_id IN (
      SELECT id FROM public.addis_hub_inventory
      WHERE shipment_id = p_shipment_id AND organization_id = v_org_id
    );
  DELETE FROM public.addis_hub_inventory
  WHERE shipment_id = p_shipment_id AND organization_id = v_org_id;
  DELETE FROM public.shipments WHERE id = p_shipment_id AND organization_id = v_org_id;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'delete', 'shipment', p_shipment_id::TEXT,
          jsonb_build_object('destination', v_shipment.destination, 'deleted_at', NOW()));
  RETURN jsonb_build_object('success', true, 'shipment_id', p_shipment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_delete_inventory_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_item public.inventory_items%ROWTYPE;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'manager']::app_role[]);
  SELECT * INTO v_item FROM public.inventory_items
  WHERE id = p_item_id AND organization_id = v_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Inventory item not found or belongs to another organization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE item_id = p_item_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'CONFLICT: Items with stock movements cannot be deleted; retain the ledger or use the owner reset action.';
  END IF;

  DELETE FROM public.inventory_items WHERE id = p_item_id AND organization_id = v_org_id;
  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'delete', 'inventory_item', p_item_id::TEXT,
          jsonb_build_object('name', v_item.name, 'deleted_at', NOW()));
  RETURN jsonb_build_object('success', true, 'item_id', p_item_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reset_tenant_module_data(p_module TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner']::app_role[]);

  IF p_module = 'warehouse' OR p_module = 'lots' THEN
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.shipments WHERE organization_id = v_org_id;
    DELETE FROM public.grinding_batches WHERE organization_id = v_org_id;
    DELETE FROM public.bed_activity_logs WHERE organization_id = v_org_id
      AND bed_assignment_id IS NOT NULL;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;
    DELETE FROM public.lots WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix IN ('L', 'DRY', 'MERGE');
  ELSIF p_module = 'beds' THEN
    DELETE FROM public.bed_activity_logs WHERE organization_id = v_org_id;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;
  ELSIF p_module = 'grinding' THEN
    DELETE FROM public.grinding_batches WHERE organization_id = v_org_id;
  ELSIF p_module = 'shipments' THEN
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.shipments WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix = 'SH';
  ELSIF p_module = 'addis_hub' THEN
    DELETE FROM public.djibouti_dispatches WHERE organization_id = v_org_id;
    DELETE FROM public.addis_hub_inventory WHERE organization_id = v_org_id;
    DELETE FROM public.document_sequences WHERE organization_id = v_org_id AND prefix = 'DJIB';
  ELSIF p_module = 'payroll' THEN
    DELETE FROM public.payroll WHERE organization_id = v_org_id;
  ELSIF p_module = 'work_logs' THEN
    DELETE FROM public.work_logs WHERE organization_id = v_org_id;
  ELSIF p_module = 'inventory' THEN
    DELETE FROM public.inventory_movements WHERE organization_id = v_org_id;
    DELETE FROM public.inventory_items WHERE organization_id = v_org_id;
  ELSIF p_module = 'sites' THEN
    -- Site deletion cascades to beds; clear non-cascading operational references first.
    DELETE FROM public.bed_activity_logs WHERE organization_id = v_org_id;
    DELETE FROM public.bed_assignments WHERE organization_id = v_org_id;
    UPDATE public.profiles SET site_id = NULL
      WHERE organization_id = v_org_id;
    DELETE FROM public.sites WHERE organization_id = v_org_id;
  ELSIF p_module = 'all' THEN
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
    RAISE EXCEPTION 'INVALID_MODULE: Unknown module "%". Valid options: warehouse, beds, grinding, shipments, addis_hub, payroll, work_logs, inventory, sites, all', p_module;
  END IF;

  INSERT INTO public.audit_logs (user_id, organization_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_org_id, 'reset_data', 'module', p_module,
          jsonb_build_object('module', p_module, 'reset_at', NOW()));
  RETURN jsonb_build_object('success', true, 'module', p_module, 'organization_id', v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_inventory_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_inventory_item(UUID) TO authenticated, service_role;
