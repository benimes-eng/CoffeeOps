import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";

export interface OperationalSnapshotData {
  sites?: any[];
  blocks?: any[];
  beds?: any[];
  lots?: any[];
  bed_assignments?: any[];
  bed_activity_logs?: any[];
  grinding_batches?: any[];
  shipments?: any[];
  addis_hub_inventory?: any[];
  djibouti_dispatches?: any[];
  workers?: any[];
  work_logs?: any[];
  payroll?: any[];
  inventory_items?: any[];
  inventory_movements?: any[];
}

export interface OperationalSnapshot {
  version: "1.0";
  exportedAt: string;
  organizationId: string;
  organizationName?: string;
  checksum: string;
  counts: Record<string, number>;
  data: OperationalSnapshotData;
}

/**
 * Calculates a SHA-256 hash string for data integrity verification
 */
export async function computeChecksum(content: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Exports all operational records for the current tenant with relational context preserved
 */
export async function exportOperationalSnapshot(orgId: string, orgName?: string): Promise<OperationalSnapshot> {
  const [
    sitesRes,
    blocksRes,
    bedsRes,
    lotsRes,
    assignmentsRes,
    activityLogsRes,
    grindingRes,
    shipmentsRes,
    addisHubRes,
    djiboutiRes,
    workersRes,
    workLogsRes,
    payrollRes,
    inventoryRes,
    movementsRes,
  ] = await Promise.all([
    supabase.from("sites").select("*").eq("organization_id", orgId),
    supabase.from("blocks").select("*, sites(name)").eq("organization_id", orgId),
    supabase.from("beds").select("*, blocks(name, sites(name))").eq("organization_id", orgId),
    supabase.from("lots").select("*").eq("organization_id", orgId).order("created_at", { ascending: true }),
    supabase.from("bed_assignments").select("*, beds(bed_number, blocks(name)), lots(lot_number)").eq("organization_id", orgId),
    supabase.from("bed_activity_logs").select("*, beds(bed_number)").eq("organization_id", orgId).order("created_at", { ascending: true }),
    supabase.from("grinding_batches").select("*, lots(lot_number)").eq("organization_id", orgId),
    supabase.from("shipments").select("*, lots(lot_number)").eq("organization_id", orgId),
    supabase.from("addis_hub_inventory").select("*").eq("organization_id", orgId),
    supabase.from("djibouti_dispatches").select("*, addis_hub_inventory(lot_number)").eq("organization_id", orgId),
    supabase.from("workers").select("*").eq("organization_id", orgId),
    supabase.from("work_logs").select("*, workers(name)").eq("organization_id", orgId),
    supabase.from("payroll").select("*, workers(name)").eq("organization_id", orgId),
    supabase.from("inventory_items").select("*").eq("organization_id", orgId),
    supabase.from("inventory_movements").select("*, inventory_items(name)").eq("organization_id", orgId),
  ]);

  const sites = sitesRes.data || [];
  const blocks = (blocksRes.data || []).map((b: any) => ({
    ...b,
    site_name: b.sites?.name,
    sites: undefined,
  }));
  const beds = (bedsRes.data || []).map((bed: any) => ({
    ...bed,
    block_name: bed.blocks?.name,
    site_name: bed.blocks?.sites?.name,
    blocks: undefined,
  }));
  const lots = lotsRes.data || [];
  const bed_assignments = (assignmentsRes.data || []).map((ba: any) => ({
    ...ba,
    bed_number: ba.beds?.bed_number,
    block_name: ba.beds?.blocks?.name,
    lot_number: ba.lots?.lot_number,
    beds: undefined,
    lots: undefined,
  }));
  const bed_activity_logs = (activityLogsRes.data || []).map((bal: any) => ({
    ...bal,
    bed_number: bal.beds?.bed_number,
    beds: undefined,
  }));
  const grinding_batches = (grindingRes.data || []).map((gb: any) => ({
    ...gb,
    lot_number: gb.lots?.lot_number,
    lots: undefined,
  }));
  const shipments = (shipmentsRes.data || []).map((s: any) => ({
    ...s,
    lot_number: s.lots?.lot_number,
    lots: undefined,
  }));
  const addis_hub_inventory = addisHubRes.data || [];
  const djibouti_dispatches = (djiboutiRes.data || []).map((dd: any) => ({
    ...dd,
    lot_number: dd.addis_hub_inventory?.lot_number,
    addis_hub_inventory: undefined,
  }));
  const workers = workersRes.data || [];
  const work_logs = (workLogsRes.data || []).map((wl: any) => ({
    ...wl,
    worker_name: wl.workers?.name,
    workers: undefined,
  }));
  const payroll = (payrollRes.data || []).map((p: any) => ({
    ...p,
    worker_name: p.workers?.name,
    workers: undefined,
  }));
  const inventory_items = inventoryRes.data || [];
  const inventory_movements = (movementsRes.data || []).map((im: any) => ({
    ...im,
    item_name: im.inventory_items?.name,
    inventory_items: undefined,
  }));

  const data: OperationalSnapshotData = {
    sites,
    blocks,
    beds,
    lots,
    bed_assignments,
    bed_activity_logs,
    grinding_batches,
    shipments,
    addis_hub_inventory,
    djibouti_dispatches,
    workers,
    work_logs,
    payroll,
    inventory_items,
    inventory_movements,
  };

  const counts: Record<string, number> = {
    sites: sites.length,
    blocks: blocks.length,
    beds: beds.length,
    lots: lots.length,
    bed_assignments: bed_assignments.length,
    bed_activity_logs: bed_activity_logs.length,
    grinding_batches: grinding_batches.length,
    shipments: shipments.length,
    addis_hub_inventory: addis_hub_inventory.length,
    djibouti_dispatches: djibouti_dispatches.length,
    workers: workers.length,
    work_logs: work_logs.length,
    payroll: payroll.length,
    inventory_items: inventory_items.length,
    inventory_movements: inventory_movements.length,
  };

  const payloadString = JSON.stringify(data);
  const checksum = await computeChecksum(payloadString);

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    organizationName: orgName || "CoffeeOps Estate",
    checksum,
    counts,
    data,
  };
}

/**
 * Validates a snapshot's schema and checksum
 */
export async function validateSnapshot(snapshot: any): Promise<{ valid: boolean; error?: string }> {
  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, error: "Snapshot is empty or not valid JSON." };
  }
  if (snapshot.version !== "1.0" || !snapshot.data || !snapshot.checksum) {
    return { valid: false, error: "Invalid snapshot format. Missing version, data, or checksum." };
  }

  const recomputed = await computeChecksum(JSON.stringify(snapshot.data));
  if (recomputed !== snapshot.checksum) {
    return {
      valid: false,
      error: "Integrity check failed: Checksum mismatch. The file may have been modified or corrupted.",
    };
  }

  return { valid: true };
}

export type SyncStrategy = "skip_existing" | "overwrite_existing";

export interface SyncImportResult {
  success: boolean;
  strategy: SyncStrategy;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

/**
 * Authoritatively imports and merges operational snapshot data into the active organization via RPC
 */
export async function importOperationalSnapshot(
  snapshot: OperationalSnapshot,
  strategy: SyncStrategy = "skip_existing"
): Promise<SyncImportResult> {
  const validation = await validateSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { data, error } = await supabase.rpc("fn_import_operational_snapshot" as any, {
    p_snapshot_data: snapshot.data,
    p_strategy: strategy,
  });

  if (error) throw parseSupabaseError(error);
  return data as SyncImportResult;
}
