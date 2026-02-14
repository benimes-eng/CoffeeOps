import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Bed = Tables<"beds"> & {
  block?: Tables<"blocks"> & { site?: Tables<"sites"> };
  active_assignment?: Tables<"bed_assignments"> & { lot?: Tables<"lots"> };
};

export type BedWithDetails = Bed;

export async function fetchBedsWithDetails(siteId?: string, blockId?: string) {
  let query = supabase
    .from("beds")
    .select(`
      *,
      block:blocks!beds_block_id_fkey(*, site:sites!blocks_site_id_fkey(*))
    `)
    .order("bed_number");

  if (blockId) {
    query = query.eq("block_id", blockId);
  }

  const { data: beds, error } = await query;
  if (error) throw error;

  // Filter by site if needed
  let filtered = beds || [];
  if (siteId) {
    filtered = filtered.filter((b: any) => b.block?.site_id === siteId);
  }

  // Fetch active assignments for all beds
  const bedIds = filtered.map((b) => b.id);
  const { data: assignments } = await supabase
    .from("bed_assignments")
    .select("*, lot:lots!bed_assignments_lot_id_fkey(*)")
    .in("bed_id", bedIds)
    .eq("is_active", true);

  const assignmentMap = new Map<string, any>();
  assignments?.forEach((a) => assignmentMap.set(a.bed_id, a));

  return filtered.map((bed) => ({
    ...bed,
    active_assignment: assignmentMap.get(bed.id) || null,
  })) as BedWithDetails[];
}

export async function fetchSites() {
  const { data, error } = await supabase.from("sites").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function fetchBlocks(siteId?: string) {
  let query = supabase.from("blocks").select("*").order("name");
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchLots(status?: string) {
  let query = supabase.from("lots").select("*").order("intake_date", { ascending: false });
  if (status) query = query.eq("status", status as any);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchBedActivityLogs(bedId: string) {
  const { data, error } = await supabase
    .from("bed_activity_logs")
    .select("*")
    .eq("bed_id", bedId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function logBedAction(
  bedId: string,
  actionType: string,
  description?: string,
  bedAssignmentId?: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("bed_activity_logs").insert({
    bed_id: bedId,
    action_type: actionType as any,
    description,
    bed_assignment_id: bedAssignmentId || null,
    performed_by: user?.id || null,
  });
  if (error) throw error;
}

export async function assignLotToBed(
  bedId: string,
  lotId: string,
  weight: number,
  density: number,
  area: number
) {
  // Update bed status
  const { error: bedError } = await supabase
    .from("beds")
    .update({ status: "occupied" as any })
    .eq("id", bedId);
  if (bedError) throw bedError;

  // Create assignment
  const { data: assignment, error: assignError } = await supabase
    .from("bed_assignments")
    .insert({
      bed_id: bedId,
      lot_id: lotId,
      assigned_weight: weight,
      assigned_area: area,
      density_used: density,
    })
    .select()
    .single();
  if (assignError) throw assignError;

  // Log activity
  await logBedAction(bedId, "assignment", `Assigned ${weight} KG from lot`, assignment.id);

  return assignment;
}

export async function markBedFinished(bedId: string, assignmentId: string) {
  await supabase
    .from("bed_assignments")
    .update({ is_active: false, completed_at: new Date().toISOString() })
    .eq("id", assignmentId);

  await supabase.from("beds").update({ status: "empty" as any }).eq("id", bedId);
  await logBedAction(bedId, "finished", "Drying complete", assignmentId);
}

export async function flagMaintenance(bedId: string, description: string) {
  await supabase.from("beds").update({ status: "maintenance" as any }).eq("id", bedId);
  await logBedAction(bedId, "maintenance_flag", description);
}

export async function removeMaintenance(bedId: string) {
  await supabase.from("beds").update({ status: "empty" as any }).eq("id", bedId);
  await logBedAction(bedId, "maintenance_end", "Maintenance resolved");
}

export function getDryingDays(assignedDate: string): number {
  const now = new Date();
  const assigned = new Date(assignedDate);
  return Math.floor((now.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24));
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
