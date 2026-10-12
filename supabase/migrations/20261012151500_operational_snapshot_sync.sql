-- Migration: fn_import_operational_snapshot
-- Enables authoritative, tenant-safe merge & update import of full operational data
-- Supports conflict strategy: 'skip_existing' (default, leaves cloud data as is) or 'overwrite_existing' (updates matching)

CREATE OR REPLACE FUNCTION public.fn_import_operational_snapshot(
  p_snapshot_data JSONB,
  p_strategy TEXT DEFAULT 'skip_existing'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_strategy TEXT;
  v_inserted_count INT := 0;
  v_updated_count INT := 0;
  v_skipped_count INT := 0;

  r JSONB;
  v_target_site_id UUID;
  v_target_block_id UUID;
  v_target_bed_id UUID;
  v_target_lot_id UUID;
  v_target_worker_id UUID;
  v_target_item_id UUID;
  v_existing_log_id UUID;
  v_existing_payroll_id UUID;
  v_existing_batch_id UUID;
  v_existing_shipment_id UUID;
  v_existing_hub_id UUID;
BEGIN
  -- 1. Enforce active tenant actor permissions (owners and super_admins only)
  v_org_id := public.assert_active_tenant_actor(ARRAY['owner', 'super_admin']::public.app_role[]);

  -- Extract strategy: either from parameter or inside snapshot payload
  v_strategy := COALESCE(p_strategy, p_snapshot_data->>'strategy', 'skip_existing');

  -- Temporarily allow triggers to accept synced administrator payloads
  PERFORM set_config('coffeeops.import_sync', 'true', true);

  -- 2. SITES (Natural key: organization_id, lower(name))
  IF p_snapshot_data ? 'sites' AND jsonb_typeof(p_snapshot_data->'sites') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'sites')
    LOOP
      SELECT id INTO v_target_site_id FROM public.sites
      WHERE organization_id = v_org_id AND lower(name) = lower(r->>'name')
      LIMIT 1;

      IF v_target_site_id IS NULL THEN
        INSERT INTO public.sites (organization_id, name, location, created_at)
        VALUES (
          v_org_id,
          r->>'name',
          r->>'location',
          COALESCE((r->>'created_at')::timestamptz, now())
        );
        v_inserted_count := v_inserted_count + 1;
      ELSE
        IF v_strategy = 'overwrite_existing' THEN
          UPDATE public.sites SET
            location = COALESCE(r->>'location', location)
          WHERE id = v_target_site_id;
          v_updated_count := v_updated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. BLOCKS (Natural key: site_id, lower(name))
  IF p_snapshot_data ? 'blocks' AND jsonb_typeof(p_snapshot_data->'blocks') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'blocks')
    LOOP
      SELECT id INTO v_target_site_id FROM public.sites
      WHERE organization_id = v_org_id AND (id = (r->>'site_id')::uuid OR lower(name) = lower(r->>'site_name'))
      LIMIT 1;

      IF v_target_site_id IS NULL THEN
        SELECT id INTO v_target_site_id FROM public.sites
        WHERE organization_id = v_org_id
        LIMIT 1;
      END IF;

      IF v_target_site_id IS NOT NULL THEN
        SELECT id INTO v_target_block_id FROM public.blocks
        WHERE organization_id = v_org_id AND site_id = v_target_site_id AND lower(name) = lower(r->>'name')
        LIMIT 1;

        IF v_target_block_id IS NULL THEN
          INSERT INTO public.blocks (organization_id, site_id, name, created_at)
          VALUES (
            v_org_id,
            v_target_site_id,
            r->>'name',
            COALESCE((r->>'created_at')::timestamptz, now())
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 4. BEDS (Natural key: block_id, bed_number)
  IF p_snapshot_data ? 'beds' AND jsonb_typeof(p_snapshot_data->'beds') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'beds')
    LOOP
      SELECT b.id INTO v_target_block_id FROM public.blocks b
      WHERE b.organization_id = v_org_id AND (b.id = (r->>'block_id')::uuid OR lower(b.name) = lower(r->>'block_name'))
      LIMIT 1;

      IF v_target_block_id IS NULL THEN
        SELECT b.id INTO v_target_block_id FROM public.blocks b
        WHERE b.organization_id = v_org_id
        LIMIT 1;
      END IF;

      IF v_target_block_id IS NOT NULL THEN
        SELECT id INTO v_target_bed_id FROM public.beds
        WHERE organization_id = v_org_id AND block_id = v_target_block_id AND bed_number = (r->>'bed_number')
        LIMIT 1;

        IF v_target_bed_id IS NULL THEN
          INSERT INTO public.beds (
            organization_id, block_id, bed_number, length, width, material_type, status
          ) VALUES (
            v_org_id,
            v_target_block_id,
            r->>'bed_number',
            COALESCE((r->>'length')::numeric, 10),
            COALESCE((r->>'width')::numeric, 1.5),
            COALESCE(r->>'material_type', r->>'mesh_type', 'wire mesh'),
            COALESCE((r->>'status')::public.bed_status, 'empty'::public.bed_status)
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          IF v_strategy = 'overwrite_existing' THEN
            UPDATE public.beds SET
              length = COALESCE((r->>'length')::numeric, length),
              width = COALESCE((r->>'width')::numeric, width),
              material_type = COALESCE(r->>'material_type', r->>'mesh_type', material_type),
              status = COALESCE((r->>'status')::public.bed_status, status),
              updated_at = now()
            WHERE id = v_target_bed_id;
            v_updated_count := v_updated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 5. LOTS (Natural key: organization_id, lot_number)
  IF p_snapshot_data ? 'lots' AND jsonb_typeof(p_snapshot_data->'lots') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'lots')
    LOOP
      SELECT id INTO v_target_lot_id FROM public.lots
      WHERE organization_id = v_org_id AND lot_number = (r->>'lot_number')
      LIMIT 1;

      IF v_target_lot_id IS NULL THEN
        INSERT INTO public.lots (
          organization_id, lot_number, region, initial_weight, current_weight, intake_date, status, notes, created_at, updated_at
        ) VALUES (
          v_org_id,
          r->>'lot_number',
          COALESCE(r->>'region', 'Yirgacheffe'),
          COALESCE((r->>'initial_weight')::numeric, 0),
          COALESCE((r->>'current_weight')::numeric, 0),
          COALESCE((r->>'intake_date')::date, CURRENT_DATE),
          COALESCE((r->>'status')::public.lot_status, 'received'::public.lot_status),
          r->>'notes',
          COALESCE((r->>'created_at')::timestamptz, now()),
          COALESCE((r->>'updated_at')::timestamptz, now())
        );
        v_inserted_count := v_inserted_count + 1;
      ELSE
        IF v_strategy = 'overwrite_existing' THEN
          UPDATE public.lots SET
            current_weight = COALESCE((r->>'current_weight')::numeric, current_weight),
            status = COALESCE((r->>'status')::public.lot_status, status),
            notes = COALESCE(r->>'notes', notes),
            updated_at = now()
          WHERE id = v_target_lot_id;
          v_updated_count := v_updated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 6. WORKERS (Natural key: organization_id, lower(name))
  IF p_snapshot_data ? 'workers' AND jsonb_typeof(p_snapshot_data->'workers') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'workers')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND lower(name) = lower(r->>'name')
      LIMIT 1;

      IF v_target_worker_id IS NULL THEN
        INSERT INTO public.workers (
          organization_id, name, role, wage_type, wage_rate, status
        ) VALUES (
          v_org_id,
          r->>'name',
          r->>'role',
          COALESCE((r->>'wage_type')::public.wage_type, 'daily'::public.wage_type),
          COALESCE((r->>'wage_rate')::numeric, 0),
          COALESCE((r->>'status')::public.worker_status, 'active'::public.worker_status)
        );
        v_inserted_count := v_inserted_count + 1;
      ELSE
        IF v_strategy = 'overwrite_existing' THEN
          UPDATE public.workers SET
            role = COALESCE(r->>'role', role),
            wage_type = COALESCE((r->>'wage_type')::public.wage_type, wage_type),
            wage_rate = COALESCE((r->>'wage_rate')::numeric, wage_rate),
            status = COALESCE((r->>'status')::public.worker_status, status),
            updated_at = now()
          WHERE id = v_target_worker_id;
          v_updated_count := v_updated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 7. WORK LOGS (Natural key: worker, date, activity_type)
  IF p_snapshot_data ? 'work_logs' AND jsonb_typeof(p_snapshot_data->'work_logs') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'work_logs')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND (id = (r->>'worker_id')::uuid OR lower(name) = lower(r->>'worker_name'))
      LIMIT 1;

      IF v_target_worker_id IS NOT NULL THEN
        SELECT id INTO v_existing_log_id FROM public.work_logs
        WHERE organization_id = v_org_id
          AND worker_id = v_target_worker_id
          AND date = COALESCE((r->>'date')::date, CURRENT_DATE)
          AND activity_type = COALESCE(r->>'activity_type', 'General')
        LIMIT 1;

        IF v_existing_log_id IS NULL THEN
          INSERT INTO public.work_logs (
            organization_id, worker_id, date, hours_worked, activity_type
          ) VALUES (
            v_org_id,
            v_target_worker_id,
            COALESCE((r->>'date')::date, CURRENT_DATE),
            COALESCE((r->>'hours_worked')::numeric, 8),
            COALESCE(r->>'activity_type', 'General')
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          IF v_strategy = 'overwrite_existing' THEN
            UPDATE public.work_logs SET
              hours_worked = COALESCE((r->>'hours_worked')::numeric, hours_worked)
            WHERE id = v_existing_log_id;
            v_updated_count := v_updated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 8. PAYROLL (Natural key: worker, period_start, period_end)
  IF p_snapshot_data ? 'payroll' AND jsonb_typeof(p_snapshot_data->'payroll') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'payroll')
    LOOP
      SELECT id INTO v_target_worker_id FROM public.workers
      WHERE organization_id = v_org_id AND (id = (r->>'worker_id')::uuid OR lower(name) = lower(r->>'worker_name'))
      LIMIT 1;

      IF v_target_worker_id IS NOT NULL THEN
        SELECT id INTO v_existing_payroll_id FROM public.payroll
        WHERE organization_id = v_org_id
          AND worker_id = v_target_worker_id
          AND period_start = COALESCE((r->>'period_start')::date, CURRENT_DATE)
          AND period_end = COALESCE((r->>'period_end')::date, CURRENT_DATE)
        LIMIT 1;

        IF v_existing_payroll_id IS NULL THEN
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
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          IF v_strategy = 'overwrite_existing' THEN
            UPDATE public.payroll SET
              total_hours = COALESCE((r->>'total_hours')::numeric, total_hours),
              total_pay = COALESCE((r->>'total_pay')::numeric, total_pay),
              approved = COALESCE((r->>'approved')::boolean, approved)
            WHERE id = v_existing_payroll_id;
            v_updated_count := v_updated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 9. GRINDING BATCHES (Natural key: lot, started_at)
  IF p_snapshot_data ? 'grinding_batches' AND jsonb_typeof(p_snapshot_data->'grinding_batches') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'grinding_batches')
    LOOP
      SELECT id INTO v_target_lot_id FROM public.lots
      WHERE organization_id = v_org_id AND (id = (r->>'lot_id')::uuid OR lot_number = r->>'lot_number')
      LIMIT 1;

      IF v_target_lot_id IS NOT NULL THEN
        SELECT id INTO v_existing_batch_id FROM public.grinding_batches
        WHERE organization_id = v_org_id
          AND lot_id = v_target_lot_id
          AND started_at = COALESCE((r->>'started_at')::timestamptz, (r->>'start_time')::timestamptz, now())
        LIMIT 1;

        IF v_existing_batch_id IS NULL THEN
          INSERT INTO public.grinding_batches (
            organization_id, lot_id, dry_weight, ground_weight, status, started_at, completed_at
          ) VALUES (
            v_org_id,
            v_target_lot_id,
            COALESCE((r->>'dry_weight')::numeric, 0),
            (r->>'ground_weight')::numeric,
            COALESCE(r->>'status', 'completed'),
            COALESCE((r->>'started_at')::timestamptz, (r->>'start_time')::timestamptz, now()),
            COALESCE((r->>'completed_at')::timestamptz, (r->>'end_time')::timestamptz)
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          IF v_strategy = 'overwrite_existing' THEN
            UPDATE public.grinding_batches SET
              dry_weight = COALESCE((r->>'dry_weight')::numeric, dry_weight),
              ground_weight = COALESCE((r->>'ground_weight')::numeric, ground_weight),
              status = COALESCE(r->>'status', status),
              completed_at = COALESCE((r->>'completed_at')::timestamptz, (r->>'end_time')::timestamptz, completed_at)
            WHERE id = v_existing_batch_id;
            v_updated_count := v_updated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 10. SHIPMENTS (Natural key: shipment_number or lot + destination)
  IF p_snapshot_data ? 'shipments' AND jsonb_typeof(p_snapshot_data->'shipments') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'shipments')
    LOOP
      SELECT id INTO v_target_lot_id FROM public.lots
      WHERE organization_id = v_org_id AND (id = (r->>'lot_id')::uuid OR lot_number = r->>'lot_number')
      LIMIT 1;

      IF v_target_lot_id IS NOT NULL THEN
        SELECT id INTO v_existing_shipment_id FROM public.shipments
        WHERE organization_id = v_org_id AND (
          (r->>'shipment_number' IS NOT NULL AND shipment_number = r->>'shipment_number')
          OR (lot_id = v_target_lot_id AND destination = COALESCE(r->>'destination', 'Addis Ababa Dry Port (Kality)'))
        )
        LIMIT 1;

        IF v_existing_shipment_id IS NULL THEN
          INSERT INTO public.shipments (
            organization_id, lot_id, shipment_number, destination, weight, shipment_date, status
          ) VALUES (
            v_org_id,
            v_target_lot_id,
            r->>'shipment_number',
            COALESCE(r->>'destination', 'Addis Ababa Dry Port (Kality)'),
            COALESCE((r->>'weight')::numeric, 0),
            COALESCE((r->>'shipment_date')::date, CURRENT_DATE),
            COALESCE(r->>'status', 'preparing')
          );
          v_inserted_count := v_inserted_count + 1;
        ELSE
          IF v_strategy = 'overwrite_existing' THEN
            UPDATE public.shipments SET
              weight = COALESCE((r->>'weight')::numeric, weight),
              shipment_date = COALESCE((r->>'shipment_date')::date, shipment_date),
              status = COALESCE(r->>'status', status)
            WHERE id = v_existing_shipment_id;
            v_updated_count := v_updated_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 11. ADDIS ABABA HUB INVENTORY (Natural key: lot_number)
  IF p_snapshot_data ? 'addis_hub_inventory' AND jsonb_typeof(p_snapshot_data->'addis_hub_inventory') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'addis_hub_inventory')
    LOOP
      SELECT id INTO v_existing_hub_id FROM public.addis_hub_inventory
      WHERE organization_id = v_org_id AND lot_number = r->>'lot_number'
      LIMIT 1;

      IF v_existing_hub_id IS NULL THEN
        INSERT INTO public.addis_hub_inventory (
          organization_id, lot_number, region, incoming_weight, current_weight, moisture_percentage, warehouse_bay, status, received_at
        ) VALUES (
          v_org_id,
          r->>'lot_number',
          COALESCE(r->>'region', 'Yirgacheffe'),
          COALESCE((r->>'incoming_weight')::numeric, 1),
          COALESCE((r->>'current_weight')::numeric, 1),
          (r->>'moisture_percentage')::numeric,
          COALESCE(r->>'warehouse_bay', 'Bay-A1'),
          COALESCE(r->>'status', 'in_storage'),
          COALESCE((r->>'received_at')::timestamptz, now())
        );
        v_inserted_count := v_inserted_count + 1;
      ELSE
        IF v_strategy = 'overwrite_existing' THEN
          UPDATE public.addis_hub_inventory SET
            current_weight = COALESCE((r->>'current_weight')::numeric, current_weight),
            moisture_percentage = COALESCE((r->>'moisture_percentage')::numeric, moisture_percentage),
            warehouse_bay = COALESCE(r->>'warehouse_bay', warehouse_bay),
            status = COALESCE(r->>'status', status)
          WHERE id = v_existing_hub_id;
          v_updated_count := v_updated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 12. INVENTORY ITEMS (Natural key: lower(name))
  IF p_snapshot_data ? 'inventory_items' AND jsonb_typeof(p_snapshot_data->'inventory_items') = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_snapshot_data->'inventory_items')
    LOOP
      SELECT id INTO v_target_item_id FROM public.inventory_items
      WHERE organization_id = v_org_id AND lower(name) = lower(r->>'name')
      LIMIT 1;

      IF v_target_item_id IS NULL THEN
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
        v_inserted_count := v_inserted_count + 1;
      ELSE
        IF v_strategy = 'overwrite_existing' THEN
          UPDATE public.inventory_items SET
            quantity = COALESCE((r->>'quantity')::numeric, quantity),
            location = COALESCE(r->>'location', location)
          WHERE id = v_target_item_id;
          v_updated_count := v_updated_count + 1;
        ELSE
          v_skipped_count := v_skipped_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 13. Audit Log
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_org_id,
    auth.uid(),
    'sync_import',
    'operational_snapshot',
    v_org_id::text,
    jsonb_build_object(
      'strategy', v_strategy,
      'inserted', v_inserted_count,
      'updated', v_updated_count,
      'skipped', v_skipped_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'strategy', v_strategy,
    'insertedCount', v_inserted_count,
    'updatedCount', v_updated_count,
    'skippedCount', v_skipped_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_import_operational_snapshot(JSONB, TEXT) TO authenticated, service_role;
