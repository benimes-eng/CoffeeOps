-- Migration: fn_import_operational_snapshot
-- Enables authoritative, tenant-safe merge & update import of full operational data

CREATE OR REPLACE FUNCTION public.fn_import_operational_snapshot(
  p_snapshot_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_sites_count INT := 0;
  v_blocks_count INT := 0;
  v_beds_count INT := 0;
  v_lots_count INT := 0;
  v_assignments_count INT := 0;
  v_grinding_count INT := 0;
  v_shipments_count INT := 0;
  v_addis_count INT := 0;
  v_djibouti_count INT := 0;
  v_workers_count INT := 0;
  v_logs_count INT := 0;
  v_payroll_count INT := 0;
  v_inv_count INT := 0;

  r JSONB;
  v_target_site_id UUID;
  v_target_block_id UUID;
  v_target_bed_id UUID;
  v_target_lot_id UUID;
  v_target_worker_id UUID;
  v_target_assignment_id UUID;
  v_target_item_id UUID;
  v_target_hub_id UUID;
BEGIN
  -- 1. Enforce active tenant actor permissions (owners and super_admins only)
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'super_admin']::public.app_role[]);

  -- Temporarily allow triggers to accept synced administrator payloads
  PERFORM set_config('coffeeops.import_sync', 'true', true);

  -- 2. Upsert SITES (Natural key: organization_id, name)
  IF p_snapshot_data ? 'sites' AND jsonb_typeof(p_snapshot_data->'sites') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'sites')
    LOOP
      INSERT INTO public.sites (organization_id, name, location, created_at)
      VALUES (
        v_org_id,
        r->>'name',
        r->>'location',
        COALESCE((r->>'created_at')::timestamptz, now())
      )
      ON CONFLICT DO NOTHING;
      v_sites_count := v_sites_count + 1;
    END LOOP;
  END IF;

  -- 3. Upsert BLOCKS (Natural key: site_id, name)
  IF p_snapshot_data ? 'blocks' AND jsonb_typeof(p_snapshot_data->'blocks') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'blocks')
    LOOP
      SELECT id INTO v_target_site_id FROM public.sites
      WHERE organization_id = v_org_id AND name = (r->>'site_name')
      LIMIT 1;

      IF v_target_site_id IS NULL THEN
        SELECT id INTO v_target_site_id FROM public.sites
        WHERE organization_id = v_org_id
        LIMIT 1;
      END IF;

      IF v_target_site_id IS NOT NULL THEN
        INSERT INTO public.blocks (organization_id, site_id, name, created_at)
        VALUES (
          v_org_id,
          v_target_site_id,
          r->>'name',
          COALESCE((r->>'created_at')::timestamptz, now())
        )
        ON CONFLICT DO NOTHING;
        v_blocks_count := v_blocks_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 4. Upsert BEDS (Natural key: block_id, bed_number)
  IF p_snapshot_data ? 'beds' AND jsonb_typeof(p_snapshot_data->'beds') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'beds')
    LOOP
      SELECT b.id INTO v_target_block_id FROM public.blocks b
      WHERE b.organization_id = v_org_id AND b.name = (r->>'block_name')
      LIMIT 1;

      IF v_target_block_id IS NULL THEN
        SELECT b.id INTO v_target_block_id FROM public.blocks b
        WHERE b.organization_id = v_org_id
        LIMIT 1;
      END IF;

      IF v_target_block_id IS NOT NULL THEN
        INSERT INTO public.beds (
          organization_id, block_id, bed_number, length, width, surface_area, mesh_type, status, notes
        ) VALUES (
          v_org_id,
          v_target_block_id,
          r->>'bed_number',
          COALESCE((r->>'length')::numeric, 10),
          COALESCE((r->>'width')::numeric, 1.5),
          COALESCE((r->>'surface_area')::numeric, 15),
          COALESCE(r->>'mesh_type', 'wire'),
          COALESCE((r->>'status')::public.bed_status, 'empty'::public.bed_status),
          r->>'notes'
        )
        ON CONFLICT DO NOTHING;
        v_beds_count := v_beds_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 5. Upsert LOTS (Natural key: organization_id, lot_number)
  IF p_snapshot_data ? 'lots' AND jsonb_typeof(p_snapshot_data->'lots') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'lots')
    LOOP
      INSERT INTO public.lots (
        organization_id, lot_number, region, initial_weight, current_weight, intake_date, status, notes, created_at, updated_at
      ) VALUES (
        v_org_id,
        r->>'lot_number',
        r->>'region',
        COALESCE((r->>'initial_weight')::numeric, 0),
        COALESCE((r->>'current_weight')::numeric, 0),
        COALESCE((r->>'intake_date')::date, CURRENT_DATE),
        COALESCE((r->>'status')::public.lot_status, 'received'::public.lot_status),
        r->>'notes',
        COALESCE((r->>'created_at')::timestamptz, now()),
        COALESCE((r->>'updated_at')::timestamptz, now())
      )
      ON CONFLICT (organization_id, lot_number) DO UPDATE
      SET
        current_weight = EXCLUDED.current_weight,
        status = EXCLUDED.status,
        notes = COALESCE(EXCLUDED.notes, lots.notes),
        updated_at = now();
      v_lots_count := v_lots_count + 1;
    END LOOP;
  END IF;

  -- 6. Upsert WORKERS (Natural key: organization_id, name)
  IF p_snapshot_data ? 'workers' AND jsonb_typeof(p_snapshot_data->'workers') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'workers')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND lower(name) = lower(r->>'name')
      LIMIT 1;

      IF v_target_worker_id IS NULL THEN
        INSERT INTO public.workers (
          organization_id, name, role, wage_type, wage_rate, status, hire_date
        ) VALUES (
          v_org_id,
          r->>'name',
          r->>'role',
          COALESCE((r->>'wage_type')::public.wage_type, 'daily'::public.wage_type),
          COALESCE((r->>'wage_rate')::numeric, 0),
          COALESCE((r->>'status')::public.worker_status, 'active'::public.worker_status),
          COALESCE((r->>'hire_date')::date, CURRENT_DATE)
        );
      ELSE
        UPDATE public.workers SET
          wage_rate = COALESCE((r->>'wage_rate')::numeric, wage_rate),
          status = COALESCE((r->>'status')::public.worker_status, status)
        WHERE id = v_target_worker_id;
      END IF;
      v_workers_count := v_workers_count + 1;
    END LOOP;
  END IF;

  -- 7. Upsert WORK LOGS
  IF p_snapshot_data ? 'work_logs' AND jsonb_typeof(p_snapshot_data->'work_logs') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'work_logs')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND (id = (r->>'worker_id')::uuid OR lower(name) = lower(r->>'worker_name'))
      LIMIT 1;

      IF v_target_worker_id IS NOT NULL THEN
        INSERT INTO public.work_logs (
          organization_id, worker_id, date, hours_worked, activity_type, notes
        ) VALUES (
          v_org_id,
          v_target_worker_id,
          COALESCE((r->>'date')::date, CURRENT_DATE),
          COALESCE((r->>'hours_worked')::numeric, 8),
          COALESCE(r->>'activity_type', 'General'),
          r->>'notes'
        );
        v_logs_count := v_logs_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 8. Upsert PAYROLL
  IF p_snapshot_data ? 'payroll' AND jsonb_typeof(p_snapshot_data->'payroll') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'payroll')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND (id = (r->>'worker_id')::uuid OR lower(name) = lower(r->>'worker_name'))
      LIMIT 1;

      IF v_target_worker_id IS NOT NULL THEN
        INSERT INTO public.payroll (
          organization_id, worker_id, period_start, period_end, total_hours, total_pay, approved
        ) VALUES (
          v_org_id,
          v_target_worker_id,
          COALESCE((r->>'period_start')::date, CURRENT_DATE),
          COALESCE((r->>'period_end')::date, CURRENT_DATE),
          COALESCE((r->>'total_hours')::numeric, 0),
          COALESCE((r->>'total_pay')::numeric, 0),
          COALESCE((r->>'approved')::boolean, false)
        )
        ON CONFLICT DO NOTHING;
        v_payroll_count := v_payroll_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 9. Upsert GRINDING BATCHES
  IF p_snapshot_data ? 'grinding_batches' AND jsonb_typeof(p_snapshot_data->'grinding_batches') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'grinding_batches')
    LOOP
      SELECT id INTO v_target_lot_id FROM public.lots
      WHERE organization_id = v_org_id AND (id = (r->>'lot_id')::uuid OR lot_number = r->>'lot_number')
      LIMIT 1;

      IF v_target_lot_id IS NOT NULL THEN
        INSERT INTO public.grinding_batches (
          organization_id, lot_id, dry_weight, ground_weight, milling_loss, status, start_time, end_time
        ) VALUES (
          v_org_id,
          v_target_lot_id,
          COALESCE((r->>'dry_weight')::numeric, 0),
          (r->>'ground_weight')::numeric,
          (r->>'milling_loss')::numeric,
          COALESCE(r->>'status', 'completed'),
          COALESCE((r->>'start_time')::timestamptz, now()),
          (r->>'end_time')::timestamptz
        );
        v_grinding_count := v_grinding_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 10. Upsert SHIPMENTS
  IF p_snapshot_data ? 'shipments' AND jsonb_typeof(p_snapshot_data->'shipments') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'shipments')
    LOOP
      SELECT id INTO v_target_lot_id FROM public.lots
      WHERE organization_id = v_org_id AND (id = (r->>'lot_id')::uuid OR lot_number = r->>'lot_number')
      LIMIT 1;

      IF v_target_lot_id IS NOT NULL THEN
        INSERT INTO public.shipments (
          organization_id, lot_id, shipment_number, destination, weight, shipment_date, status, notes
        ) VALUES (
          v_org_id,
          v_target_lot_id,
          r->>'shipment_number',
          COALESCE(r->>'destination', 'Addis Ababa Dry Port (Kality)'),
          COALESCE((r->>'weight')::numeric, 0),
          COALESCE((r->>'shipment_date')::date, CURRENT_DATE),
          COALESCE(r->>'status', 'preparing'),
          r->>'notes'
        )
        ON CONFLICT DO NOTHING;
        v_shipments_count := v_shipments_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 11. Upsert ADDIS ABABA HUB INVENTORY
  IF p_snapshot_data ? 'addis_hub_inventory' AND jsonb_typeof(p_snapshot_data->'addis_hub_inventory') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'addis_hub_inventory')
    LOOP
      INSERT INTO public.addis_hub_inventory (
        organization_id, lot_number, region, incoming_weight, current_weight, moisture_percentage, warehouse_bay, status, received_at
      ) VALUES (
        v_org_id,
        r->>'lot_number',
        COALESCE(r->>'region', 'Yirgacheffe'),
        COALESCE((r->>'incoming_weight')::numeric, 0),
        COALESCE((r->>'current_weight')::numeric, 0),
        COALESCE((r->>'moisture_percentage')::numeric, 11.5),
        COALESCE(r->>'warehouse_bay', 'Bay-A1'),
        COALESCE(r->>'status', 'in_storage'),
        COALESCE((r->>'received_at')::timestamptz, now())
      );
      v_addis_count := v_addis_count + 1;
    END LOOP;
  END IF;

  -- 12. Upsert INVENTORY ITEMS & MOVEMENTS
  IF p_snapshot_data ? 'inventory_items' AND jsonb_typeof(p_snapshot_data->'inventory_items') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'inventory_items')
    LOOP
      INSERT INTO public.inventory_items (
        organization_id, name, category, quantity, unit, location
      ) VALUES (
        v_org_id,
        r->>'name',
        COALESCE((r->>'category')::public.inventory_category, 'machinery'::public.inventory_category),
        COALESCE((r->>'quantity')::numeric, 0),
        r->>'unit',
        r->>'location'
      );
      v_inv_count := v_inv_count + 1;
    END LOOP;
  END IF;

  -- 13. Audit Log
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, new_values
  ) VALUES (
    v_org_id,
    auth.uid(),
    'sync_import',
    'operational_snapshot',
    v_org_id,
    jsonb_build_object(
      'sites', v_sites_count,
      'beds', v_beds_count,
      'lots', v_lots_count,
      'workers', v_workers_count,
      'payroll', v_payroll_count,
      'shipments', v_shipments_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'sitesUpserted', v_sites_count,
    'blocksUpserted', v_blocks_count,
    'bedsUpserted', v_beds_count,
    'lotsUpserted', v_lots_count,
    'workersUpserted', v_workers_count,
    'workLogsUpserted', v_logs_count,
    'payrollUpserted', v_payroll_count,
    'grindingBatchesUpserted', v_grinding_count,
    'shipmentsUpserted', v_shipments_count,
    'addisHubUpserted', v_addis_count,
    'inventoryUpserted', v_inv_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_import_operational_snapshot(JSONB) TO authenticated, service_role;
