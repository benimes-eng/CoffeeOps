import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { parseSupabaseError } from "@/lib/errors";

export type Bed = Tables<"beds"> & {
  block?: Tables<"blocks"> & { site?: Tables<"sites"> | null } | null;
  active_assignment?: (Tables<"bed_assignments"> & { lot?: Tables<"lots"> | null }) | null;
};

export type BedWithDetails = Bed;

type BedQueryRow = Tables<"beds"> & {
  block: (Tables<"blocks"> & { site: Tables<"sites"> | null }) | null;
};

type AssignmentQueryRow = Tables<"bed_assignments"> & {
  lot: Tables<"lots"> | null;
};

export async function fetchBedsWithDetails(siteId?: string, blockId?: string): Promise<BedWithDetails[]> {
  let query = supabase
    .from("beds")
    .select(`*, block:blocks!beds_block_id_fkey(*, site:sites!blocks_site_id_fkey(*))`)
    .order("bed_number");

  if (blockId) query = query.eq("block_id", blockId);

  const { data: beds, error } = await query;
  if (error) throw parseSupabaseError(error);

  let filtered = (beds as unknown as BedQueryRow[]) || [];
  if (siteId) filtered = filtered.filter((b) => b.block?.site_id === siteId);

  const bedIds = filtered.map((b) => b.id);
  if (bedIds.length === 0) return [];

  const { data: assignments, error: assignError } = await supabase
    .from("bed_assignments")
    .select("*, lot:lots!bed_assignments_lot_id_fkey(*)")
    .in("bed_id", bedIds)
    .eq("is_active", true);

  if (assignError) throw parseSupabaseError(assignError);

  const assignmentMap = new Map<string, AssignmentQueryRow>();
  (assignments as unknown as AssignmentQueryRow[])?.forEach((a) => assignmentMap.set(a.bed_id, a));

  return filtered.map((bed) => ({
    ...bed,
    active_assignment: assignmentMap.get(bed.id) || null,
  })) as BedWithDetails[];
}

export async function fetchSites() {
  const { data, error } = await supabase.from("sites").select("*").order("name");
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function fetchBlocks(siteId?: string) {
  let query = supabase.from("blocks").select("*").order("name");
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function fetchLots(status?: Database["public"]["Enums"]["lot_status"]) {
  let query = supabase.from("lots").select("*").order("intake_date", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function fetchBedActivityLogs(bedId: string) {
  const { data, error } = await supabase
    .from("bed_activity_logs")
    .select("*")
    .eq("bed_id", bedId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function logBedAction(
  bedId: string,
  actionType: Database["public"]["Enums"]["bed_action_type"],
  description?: string,
  bedAssignmentId?: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user?.id || "")
    .single();

  const orgId = profile?.organization_id ?? "";
  const { error } = await supabase.from("bed_activity_logs").insert({
    bed_id: bedId,
    action_type: actionType,
    description,
    bed_assignment_id: bedAssignmentId || null,
    performed_by: user?.id || null,
    organization_id: orgId,
  });
  if (error) throw parseSupabaseError(error);
}

/**
 * Assigns a lot to a bed using the authoritative fn_assign_bed stored procedure.
 * Fails closed without client-side fallback.
 */
export async function assignLotToBed(
  bedId: string,
  lotId: string,
  weight: number,
  density: number = 30,
  _area?: number
) {
  const { data, error } = await supabase.rpc("fn_assign_bed", {
    p_bed_id: bedId,
    p_lot_id: lotId,
    p_weight: weight,
    p_density: density,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

/**
 * Completes drying atomically using fn_finish_drying stored procedure.
 * Fails closed without client-side fallback.
 */
export async function markBedFinished(bedId: string, assignmentId: string, finalWeight?: number) {
  if (!finalWeight || finalWeight <= 0) {
    throw new Error("Final dry weight must be greater than zero to complete drying.");
  }

  const { data, error } = await supabase.rpc("fn_finish_drying", {
    p_bed_id: bedId,
    p_assignment_id: assignmentId,
    p_final_weight: finalWeight,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

export async function flagMaintenance(bedId: string, description: string) {
  const { error } = await supabase.from("beds").update({ status: "maintenance" }).eq("id", bedId);
  if (error) throw parseSupabaseError(error);
  await logBedAction(bedId, "maintenance_start", description);
}

export async function removeMaintenance(bedId: string) {
  const { error } = await supabase.from("beds").update({ status: "empty" }).eq("id", bedId);
  if (error) throw parseSupabaseError(error);
  await logBedAction(bedId, "maintenance_end", "Maintenance resolved");
}

export function getDryingDays(assignedDate: string): number {
  const now = new Date();
  const assigned = new Date(assignedDate);
  return Math.max(0, Math.floor((now.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getDryingPhase(days: number): "critical" | "active" | "ready" {
  if (days <= 3) return "critical";
  if (days <= 10) return "active";
  return "ready";
}

export function getBedStatusColor(bed: BedWithDetails): string {
  if (bed.status === "maintenance") return "black";
  if (bed.status === "empty") return "grey";
  if (bed.active_assignment) {
    const days = getDryingDays(bed.active_assignment.assigned_date);
    const phase = getDryingPhase(days);
    if (phase === "critical") return "red";
    if (phase === "active") return "yellow";
    return "green";
  }
  return "grey";
}

export function calculateBedCapacity(surfaceArea: number, density: number = 30): number {
  if (surfaceArea <= 0 || density <= 0) return 0;
  return Math.round(surfaceArea * density);
}
