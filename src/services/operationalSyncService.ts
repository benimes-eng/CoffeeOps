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
 * Exports all operational records for the current tenant
 */
export async function exportOperationalSnapshot(orgId: string, orgName?: string): Promise<OperationalSnapshot> {
  const tables = [
    "sites",
    "blocks",
    "beds",
    "lots",
    "bed_assignments",
    "bed_activity_logs",
    "grinding_batches",
    "shipments",
    "addis_hub_inventory",
    "djibouti_dispatches",
    "workers",
    "work_logs",
    "payroll",
    "inventory_items",
    "inventory_movements",
  ] as const;

  const data: OperationalSnapshotData = {};
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const { data: rows, error } = await supabase
      .from(table as any)
      .select("*")
      .eq("organization_id", orgId);

    if (error) {
      console.warn(`Export warning for ${table}:`, error.message);
      data[table as keyof OperationalSnapshotData] = [];
      counts[table] = 0;
    } else {
      data[table as keyof OperationalSnapshotData] = rows || [];
      counts[table] = (rows || []).length;
    }
  }

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
